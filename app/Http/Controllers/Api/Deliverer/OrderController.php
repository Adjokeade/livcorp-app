<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Events\OrderLocationUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Deliverer\PushLocationRequest;
use App\Http\Requests\Deliverer\UpdateOrderStatusRequest;
use App\Models\Order;
use App\Models\TrackingPoint;
use App\Services\GeolocationService;
use App\Services\OrderStatusService;
use App\Notifications\DelivererNearby;
use App\Notifications\PriceOfferAnswered;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Actions du livreur sur les commandes.
 * Routes protégées par : auth:sanctum, role:livreur, deliverer.verified
 */
class OrderController extends Controller
{
    public function __construct(
        private readonly OrderStatusService $statusService,
        private readonly GeolocationService $geo,
    ) {}

    public function available(Request $request)
    {
        $deliverer = $request->user()->deliverer;
        $rate = (float) config('services.commission.rate_default', 15);

        // Gain estimé = prix moins la commission LIV corp. Le champ deliverer_payout, lui,
        // n'est rempli qu'à la livraison : il vaut 0 sur une course encore disponible.
        return Order::where('status', Order::STATUS_CREEE)
            ->whereNull('deliverer_id')
            ->whereDoesntHave('releases', fn ($q) => $q->where('deliverer_id', $deliverer->id))
            ->with(['client:id,first_name', 'offers' => fn ($q) => $q->where('deliverer_id', $deliverer->id)])
            ->withCount(['offers as offers_count' => fn ($q) => $q->where('status', 'pending')])
            ->latest()
            ->paginate(15)
            ->through(fn (Order $order) => [
                // Le destinataire (nom, téléphone) n'est connu du livreur qu'une fois la course acceptée.
                ...Arr::except($order->toArray(), ['offers', 'client', 'recipient_name', 'recipient_phone']),
                'client_first_name' => $order->client?->first_name,
                'estimated_earnings' => round($order->price * (1 - $rate / 100), 2),
                'my_offer' => $order->offers->first()?->only(['id', 'amount', 'message', 'status']),
            ]);
    }

    public function myOrders(Request $request)
    {
        $deliverer = $request->user()->deliverer;
        $rate = (float) config('services.commission.rate_default', 15);

        return $deliverer
            ->orders()
            ->with(['client:id,first_name,phone', 'merchant', 'offers' => fn ($q) => $q->where('deliverer_id', $deliverer->id)->where('status', 'pending')])
            ->withCount(['messages as unread_messages_count' => fn ($q) => $q->where('sender_id', '!=', $deliverer->user_id)->whereNull('read_at')->whereColumn('order_messages.deliverer_id', 'orders.deliverer_id')])
            ->latest()
            ->paginate(15)
            ->through(fn (Order $order) => [
                // Le téléphone du destinataire et du client ne sert que pendant la course.
                ...Arr::except($order->maskContacts()->toArray(), 'offers'),
                'estimated_earnings' => round($order->price * (1 - $rate / 100), 2),
                'my_offer' => $order->offers->first()?->only(['id', 'amount', 'message', 'status']),
            ]);
    }

    public function accept(Request $request, Order $order)
    {
        $this->authorize('accept', $order);

        $declined = collect();
        $taken = false;
        $released = false;

        DB::transaction(function () use ($request, &$order, &$declined, &$taken, &$released) {
            // Verrou : deux livreurs qui touchent "Accepter" en même temps, ou un client qui annule au même
            // instant, ne doivent pas produire d'erreur ni de double attribution.
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== Order::STATUS_CREEE || $order->deliverer_id !== null) {
                $taken = true;

                return;
            }

            if ($order->releases()->where('deliverer_id', $request->user()->deliverer->id)->exists()) {
                $released = true;

                return;
            }

            $order->deliverer_id = $request->user()->deliverer->id;
            $order->save();

            // Course prise au prix demandé : les propositions des autres livreurs tombent.
            $declined = $order->offers()->where('status', 'pending')->get();
            $order->offers()->where('status', 'pending')->update(['status' => 'declined']);

            $this->statusService->transitionTo($order, Order::STATUS_ACCEPTEE);
        });

        if ($released) {
            return response()->json(['message' => 'Vous vous êtes désisté de cette course : elle ne peut plus vous être attribuée.'], 409);
        }

        if ($taken) {
            return response()->json([
                'message' => "Cette course n'est plus disponible : elle a été prise par un autre livreur ou annulée.",
            ], 409);
        }

        foreach ($declined as $offer) {
            rescue(fn () => $offer->deliverer->user->notify(new PriceOfferAnswered($offer->load('order'), 'declined')));
        }

        return $order->fresh(['client:id,first_name,phone'])->maskContacts();
    }

    public function updateStatus(UpdateOrderStatusRequest $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        $validated = $request->validated();

        // La remise se confirme avec le code du destinataire (DeliveryController::deliver), pas par un simple bouton.
        if ($validated['status'] === Order::STATUS_LIVREE && $order->delivery_code !== null) {
            return response()->json(['message' => 'Saisissez le code de remise donné par le destinataire.'], 422);
        }

        // Le client règle à la réception, devant le livreur : la course ne peut être
        // clôturée qu'une fois ce paiement validé dans l'app.
        if ($validated['status'] === Order::STATUS_LIVREE && ! $order->isPaid()) {
            return response()->json([
                'message' => 'Le paiement n\'est pas encore validé par le client.',
            ], 422);
        }

        return $this->statusService->transitionTo($order, $validated['status'], $validated['note'] ?? null);
    }

    /**
     * Point GPS envoyé périodiquement par l'app du livreur pendant une livraison en cours.
     * Diffusé en temps réel au client via WebSocket (canal privé "order.{id}").
     */
    public function pushLocation(PushLocationRequest $request, Order $order)
    {
        $this->authorize('updateStatus', $order); // même règle : livreur assigné uniquement

        // La position n'est partagée que pendant la course : dès qu'elle est livrée ou annulée, l'appareil doit
        // cesser d'envoyer (et le client de voir) une position qui ne le concerne plus.
        if (! in_array($order->status, [Order::STATUS_ACCEPTEE, Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON], true)) {
            return response()->json(['message' => "Cette course n'est plus en cours."], 422);
        }

        $deliverer = $request->user()->deliverer;
        $validated = $request->validated();

        $point = TrackingPoint::create([
            'order_id' => $order->id,
            'deliverer_id' => $deliverer->id,
            'lat' => $validated['lat'],
            'lng' => $validated['lng'],
            'recorded_at' => now(),
        ]);

        $deliverer->update([
            'current_lat' => $validated['lat'],
            'current_lng' => $validated['lng'],
            'location_updated_at' => now(),
        ]);

        broadcast(new OrderLocationUpdated($order, $point))->toOthers();

        // À moins de 400 m de la destination, le client est prévenu une seule fois qu'il peut se préparer.
        if ($order->status === Order::STATUS_EN_COURS_LIVRAISON
            && $this->geo->distanceInKm((float) $validated['lat'], (float) $validated['lng'], (float) $order->dropoff_lat, (float) $order->dropoff_lng) < 0.4
            && Cache::add("nearby:{$order->id}", true, now()->addHours(6))) {
            rescue(fn () => $order->client->notify(new DelivererNearby($order->load('deliverer.user'))));
        }

        return response()->json(['message' => 'Position mise à jour.']);
    }
}
