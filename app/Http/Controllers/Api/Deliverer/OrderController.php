<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Events\OrderLocationUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Deliverer\PushLocationRequest;
use App\Http\Requests\Deliverer\UpdateOrderStatusRequest;
use App\Models\Order;
use App\Models\TrackingPoint;
use App\Services\FinanceSettings;
use App\Services\GeolocationService;
use App\Services\OrderStatusService;
use App\Notifications\DelivererNearby;
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
        $rate = FinanceSettings::commissionRate();

        // Gain estimé = prix moins la commission LIV corp. Le champ deliverer_payout, lui,
        // n'est rempli qu'à la livraison : il vaut 0 sur une course encore disponible.
        return Order::published()
            ->openTo($deliverer)
            ->whereDoesntHave('releases', fn ($q) => $q->where('deliverer_id', $deliverer->id))
            ->with(['client:id,first_name'])
            ->latest()
            ->paginate(15)
            ->through(fn (Order $order) => [
                // Le destinataire (nom, téléphone) n'est connu du livreur qu'une fois la course acceptée.
                ...Arr::except($order->toArray(), ['client', 'recipient_name', 'recipient_phone']),
                'client_first_name' => $order->client?->first_name,
                'estimated_earnings' => round($order->price * (1 - $rate / 100), 2),
            ]);
    }

    public function myOrders(Request $request)
    {
        $deliverer = $request->user()->deliverer;
        $rate = FinanceSettings::commissionRate();

        return $deliverer
            ->orders()
            ->with(['client:id,first_name,phone', 'merchant'])
            ->withCount(['messages as unread_messages_count' => fn ($q) => $q->where('sender_id', '!=', $deliverer->user_id)->whereNull('read_at')->whereColumn('order_messages.deliverer_id', 'orders.deliverer_id')])
            ->latest()
            ->paginate(15)
            ->through(fn (Order $order) => [
                // Le téléphone du destinataire et du client ne sert que pendant la course.
                ...$order->maskContacts()->toArray(),
                'estimated_earnings' => round($order->price * (1 - $rate / 100), 2),
            ]);
    }

    public function accept(Request $request, Order $order)
    {
        $this->authorize('accept', $order);

        $taken = false;
        $released = false;

        DB::transaction(function () use ($request, &$order, &$taken, &$released) {
            // Verrou : deux livreurs qui touchent "Accepter" en même temps, ou un client qui annule au même
            // instant, ne doivent pas produire d'erreur ni de double attribution.
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== Order::STATUS_CREEE || $order->deliverer_id !== null || ($order->payment_status !== 'paye' && ! $order->isCash())) {
                $taken = true;

                return;
            }

            // Course encore réservée aux livreurs favoris du client : elle n'est pas (encore) disponible.
            if (! $order->isOpenTo($request->user()->deliverer)) {
                $taken = true;

                return;
            }

            if ($order->releases()->where('deliverer_id', $request->user()->deliverer->id)->exists()) {
                $released = true;

                return;
            }

            $order->deliverer_id = $request->user()->deliverer->id;
            $order->save();

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

        return $order->fresh(['client:id,first_name,phone'])->maskContacts();
    }

    public function updateStatus(UpdateOrderStatusRequest $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        $validated = $request->validated();

        // Livraison payée en espèces : on ne récupère le colis qu'après avoir encaissé le prix auprès de l'expéditeur.
        if ($validated['status'] === Order::STATUS_COLIS_RECUPERE && $order->isCash() && ! $order->isPaid()) {
            return response()->json([
                'message' => 'Encaissez d\'abord '.number_format((float) $order->price, 0, ',', ' ').' FCFA en espèces auprès de l\'expéditeur, puis confirmez-le avant de récupérer le colis.',
            ], 422);
        }

        // Ici seulement le retrait puis le départ en livraison. La remise passe par la photo de réception
        // (DeliveryController::deliver) et la livraison n'est « livrée » qu'à la confirmation de l'expéditeur.
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

        // Saut de position impossible (plus de 250 km/h depuis le dernier point, récent) : lecture GPS aberrante,
        // souvent après un passage en tunnel ou sous un immeuble. On ne la propage pas au client.
        $previous = TrackingPoint::where('deliverer_id', $deliverer->id)->latest('recorded_at')->first();
        if ($previous && $previous->recorded_at->gt(now()->subSeconds(120))) {
            $seconds = max(1, now()->timestamp - $previous->recorded_at->timestamp);
            $km = $this->geo->distanceInKm((float) $previous->lat, (float) $previous->lng, (float) $validated['lat'], (float) $validated['lng']);

            if ($km / ($seconds / 3600) > 250 && $km > 0.2) {
                return response()->json(['message' => 'Position ignorée (saut improbable).', 'ignored' => true]);
            }
        }

        $point = TrackingPoint::create([
            'order_id' => $order->id,
            'deliverer_id' => $deliverer->id,
            'lat' => $validated['lat'],
            'lng' => $validated['lng'],
            'accuracy_m' => isset($validated['accuracy']) ? (int) round($validated['accuracy']) : null,
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
