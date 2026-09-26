<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderRelease;
use App\Notifications\DelivererArrived;
use App\Notifications\DeliveryCodeLocked;
use App\Notifications\DeliveryCodeReminder;
use App\Notifications\RecipientUnreachable;
use App\Services\AuditLogService;
use App\Services\GeolocationService;
use App\Services\OrderDispatchService;
use App\Services\OrderStatusService;
use App\Services\ParcelPhotoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

/**
 * Le déroulé de la course côté livreur, au-delà des simples changements de statut :
 * signaler son arrivée, remettre le colis contre le code du destinataire, se désister avant le retrait,
 * déclarer un destinataire injoignable. Routes protégées par : auth:sanctum, role:livreur, verified.email,
 * deliverer.verified, plus la politique "updateStatus" (livreur assigné uniquement).
 */
class DeliveryController extends Controller
{
    public const RELEASE_REASONS = [
        'panne' => 'Panne ou problème de véhicule',
        'trop_loin' => 'Trop loin pour moi',
        'colis_different' => 'Le colis ne correspond pas à la description',
        'client_injoignable' => 'Client injoignable',
        'autre' => 'Autre raison',
    ];

    public function __construct(
        private readonly GeolocationService $geo,
        private readonly OrderStatusService $statusService,
        private readonly ParcelPhotoService $photos,
        private readonly OrderDispatchService $dispatch,
        private readonly AuditLogService $auditLog,
    ) {}

    private function present(Order $order): Order
    {
        return $order->fresh(['client:id,first_name,phone'])->maskContacts();
    }

    /** "Je suis arrivé" au retrait ou à la destination, vérifié par la position quand elle est connue. */
    public function arrived(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        $point = $request->validate(['point' => 'required|in:pickup,dropoff'])['point'];
        $expected = $point === 'pickup' ? Order::STATUS_ACCEPTEE : Order::STATUS_EN_COURS_LIVRAISON;

        if ($order->status !== $expected) {
            return response()->json([
                'message' => $point === 'pickup'
                    ? 'Vous signalez votre arrivée au retrait avant de récupérer le colis.'
                    : 'Vous signalez votre arrivée chez le destinataire une fois parti en livraison.',
            ], 422);
        }

        $column = "{$point}_arrived_at";
        if ($order->{$column}) {
            return response()->json(['order' => $this->present($order)]); // déjà signalé : sans effet
        }

        // Vérification de position : impossible de déclarer "arrivé" en étant à des kilomètres. Sans position
        // récente (GPS coupé), on ne bloque pas le livreur, on ne peut simplement rien vérifier.
        $last = $order->trackingPoints()->where('deliverer_id', $order->deliverer_id)->latest('recorded_at')->first();
        if ($last && $last->recorded_at->gt(now()->subMinutes(3))) {
            $meters = $this->geo->distanceInKm(
                (float) $last->lat, (float) $last->lng,
                (float) $order->{$point.'_lat'}, (float) $order->{$point.'_lng'},
            ) * 1000;

            if ($meters > (int) config('services.orders.arrival_radius_m')) {
                return response()->json([
                    'message' => 'Vous semblez encore à environ '.(int) (round($meters / 10) * 10).' m '
                        .($point === 'pickup' ? 'du point de retrait' : 'de la destination').'. Rapprochez-vous puis réessayez.',
                ], 422);
            }
        }

        $order->forceFill([$column => now()])->save();
        $this->auditLog->log("order.arrived_{$point}", $order);
        rescue(fn () => $order->client->notify(new DelivererArrived($order->load('deliverer.user'), $point)));

        return response()->json(['order' => $this->present($order)]);
    }

    /**
     * Remise du colis : le destinataire donne son code au livreur. C'est cette saisie (et la photo, pour les
     * paiements en espèces) qui clôture la course et qui protège les deux parties d'un faux "livré".
     */
    public function deliver(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        $validated = $request->validate([
            'delivery_code' => 'nullable|digits:4',
            'delivery_photo' => [
                Rule::requiredIf($order->payment_method === 'especes'),
                'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192',
            ],
        ], [
            'delivery_code.digits' => 'Le code de remise comporte 4 chiffres.',
            'delivery_photo.required' => 'Prenez une photo du colis remis : elle est obligatoire pour un paiement en espèces.',
        ]);

        if ($order->delivery_code !== null && empty($validated['delivery_code'])) {
            return response()->json([
                'message' => 'Saisissez le code de remise donné par le destinataire.',
                'errors' => ['delivery_code' => ['Saisissez le code de remise donné par le destinataire.']],
            ], 422);
        }

        $outcome = DB::transaction(function () use ($request, $order, $validated) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Order::STATUS_EN_COURS_LIVRAISON) {
                return ['error' => 'Cette course n\'est pas en cours de livraison.', 'status' => 422];
            }
            if (! $locked->isPaid()) {
                return ['error' => 'Le paiement n\'est pas encore validé par le client.', 'status' => 422];
            }
            if ($locked->delivery_code_locked_until?->isFuture()) {
                return ['error' => 'Trop de codes erronés. Réessayez dans '.max(1, (int) ceil(now()->diffInMinutes($locked->delivery_code_locked_until, true))).' min.', 'status' => 429];
            }

            if ($locked->delivery_code !== null && ! hash_equals($locked->delivery_code, (string) $validated['delivery_code'])) {
                $attempts = $locked->delivery_code_attempts + 1;
                $max = (int) config('services.orders.code_max_attempts');

                if ($attempts >= $max) {
                    $locked->forceFill(['delivery_code_attempts' => 0, 'delivery_code_locked_until' => now()->addMinutes((int) config('services.orders.code_lock_minutes'))])->save();

                    return ['error' => 'Trop de codes erronés : la remise est bloquée '.config('services.orders.code_lock_minutes').' minutes.', 'status' => 429, 'locked' => true, 'order' => $locked];
                }

                $locked->forceFill(['delivery_code_attempts' => $attempts])->save();
                $left = $max - $attempts;

                $message = "Code incorrect. Il vous reste {$left} essai".($left > 1 ? 's' : '').'.';

                return ['error' => $message, 'status' => 422, 'errors' => ['delivery_code' => [$message]]];
            }

            if ($request->hasFile('delivery_photo')) {
                $locked->delivery_photo_path = $this->photos->store($request->file('delivery_photo'), 'deliveries');
            }
            $locked->forceFill(['delivery_code_attempts' => 0, 'delivery_code_locked_until' => null])->save();

            $this->statusService->transitionTo(
                $locked,
                Order::STATUS_LIVREE,
                $locked->delivery_code !== null ? 'Remise confirmée par le code du destinataire' : null,
            );

            return ['order' => $locked];
        });

        if (isset($outcome['error'])) {
            if (($outcome['locked'] ?? false) === true) {
                $this->auditLog->log('order.delivery_code_locked', $outcome['order']);
                rescue(fn () => $outcome['order']->client->notify(new DeliveryCodeLocked($outcome['order'])));
            }

            return response()->json(array_filter(['message' => $outcome['error'], 'errors' => $outcome['errors'] ?? null]), $outcome['status']);
        }

        return response()->json(['order' => $this->present($outcome['order'])]);
    }

    /** Le destinataire a oublié son code : le livreur prévient le client, qui le retrouve dans l'application. */
    public function remindCode(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        if ($order->status !== Order::STATUS_EN_COURS_LIVRAISON) {
            return response()->json(['message' => 'Cette course n\'est pas en cours de livraison.'], 422);
        }

        $key = "code-reminder:{$order->id}";
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json(['message' => 'Le client a déjà été prévenu plusieurs fois. Patientez quelques minutes.'], 429);
        }
        RateLimiter::hit($key, 600);

        rescue(fn () => $order->client->notify(new DeliveryCodeReminder($order->load('deliverer.user'))));

        return response()->json(['message' => 'Le client a été prévenu : il retrouve son code dans l\'application.']);
    }

    /**
     * Désistement avant le retrait du colis. La course repart en circulation au prix initial du client, le
     * client est prévenu, les livreurs proches sont alertés, et celui qui se désiste ne peut plus la reprendre.
     */
    public function release(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);
        $deliverer = $request->user()->deliverer;

        $validated = $request->validate([
            'reason' => ['required', Rule::in(array_keys(self::RELEASE_REASONS))],
            'note' => 'nullable|string|max:300',
        ]);

        $outcome = DB::transaction(function () use ($order, $deliverer, $validated) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->deliverer_id !== $deliverer->id || $locked->status !== Order::STATUS_ACCEPTEE) {
                return ['error' => 'Vous ne pouvez plus vous désister : le colis est déjà récupéré. En cas de problème, contactez-nous.'];
            }

            OrderRelease::create([
                'order_id' => $locked->id,
                'deliverer_id' => $deliverer->id,
                'reason' => $validated['reason'],
                'note' => $validated['note'] ?? null,
            ]);
            $locked->offers()->where('deliverer_id', $deliverer->id)->where('status', 'pending')->update(['status' => 'withdrawn']);

            // Retour à une course libre, au prix que le client avait fixé (pas au prix négocié avec ce livreur).
            $locked->forceFill([
                'deliverer_id' => null,
                'accepted_at' => null,
                'pickup_arrived_at' => null,
                'price' => $locked->initial_price ?? $locked->price,
            ]);

            $this->statusService->transitionTo(
                $locked,
                Order::STATUS_CREEE,
                'Désistement du livreur : '.self::RELEASE_REASONS[$validated['reason']],
            );

            return ['order' => $locked];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        $this->auditLog->log('order.released', $outcome['order'], ['reason' => $validated['reason']]);
        $this->dispatch->notifyNearbyDeliverers($outcome['order']);

        return response()->json(['order' => $outcome['order']]);
    }

    /**
     * Destinataire injoignable : après une attente minimale sur place, le livreur ouvre un litige et la course est
     * suspendue. Le client est prévenu et peut relancer la livraison (Client\DeliveryController::retry).
     */
    public function unreachable(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        if ($order->status !== Order::STATUS_EN_COURS_LIVRAISON || ! $order->dropoff_arrived_at) {
            return response()->json(['message' => 'Signalez d\'abord votre arrivée à la destination.'], 422);
        }

        $wait = (int) config('services.orders.unreachable_wait_min');
        $waited = (int) $order->dropoff_arrived_at->diffInMinutes(now(), true);
        if ($waited < $wait) {
            return response()->json([
                'message' => 'Patientez encore '.($wait - $waited).' min avant de déclarer le destinataire injoignable : essayez de l\'appeler et de lui écrire.',
            ], 422);
        }

        DB::transaction(function () use ($request, $order, $waited) {
            Dispute::create([
                'order_id' => $order->id,
                'raised_by' => $request->user()->id,
                'reason' => 'colis_non_livre',
                'description' => "Destinataire injoignable : le livreur a attendu {$waited} minutes à l'adresse de livraison sans pouvoir remettre le colis.",
                'status' => 'ouvert',
            ]);

            $order->forceFill(['failed_delivery_at' => now()])->save();
            $this->statusService->transitionTo($order, Order::STATUS_LITIGE, "Destinataire injoignable après {$waited} min d'attente");
        });

        $this->auditLog->log('order.recipient_unreachable', $order, ['waited_min' => $waited]);
        rescue(fn () => $order->client->notify(new RecipientUnreachable($order->load('deliverer.user'))));

        return response()->json(['order' => $this->present($order)]);
    }
}
