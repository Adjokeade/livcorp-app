<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderRelease;
use App\Notifications\CashCollected;
use App\Notifications\DelivererArrived;
use App\Notifications\DeliveryHandedOver;
use App\Notifications\RecipientUnreachable;
use App\Services\AuditLogService;
use App\Services\GeolocationService;
use App\Services\OrderDispatchService;
use App\Services\OrderStatusService;
use App\Services\ParcelPhotoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Le déroulé de la course côté livreur, au-delà des simples changements de statut :
 * signaler son arrivée, remettre le colis (photo de réception), se désister avant le retrait,
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

    /**
     * Livraison payée en espèces : le livreur confirme avoir encaissé le prix auprès de l'expéditeur, EN MAIN PROPRE, au
     * retrait du colis. C'est la condition pour récupérer le colis. Il détient alors l'argent et doit sa commission à LIV corp
     * (déduite de ses prochains versements).
     */
    public function cashCollected(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        if (! $order->isCash()) {
            return response()->json(['message' => 'Cette livraison est payée en ligne : il n\'y a rien à encaisser.'], 422);
        }

        $outcome = DB::transaction(function () use ($order) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Order::STATUS_ACCEPTEE) {
                return ['error' => 'Les espèces s\'encaissent au retrait du colis, avant de partir en livraison.'];
            }
            if ($locked->isPaid()) {
                return ['order' => $locked, 'already' => true];
            }

            $locked->update(['payment_status' => 'paye', 'paid_at' => now()]);

            return ['order' => $locked->fresh()];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        if (! isset($outcome['already'])) {
            $this->auditLog->log('payment.cash_collected', $outcome['order'], ['amount' => $outcome['order']->price]);
            rescue(fn () => $outcome['order']->client->notify(new CashCollected($outcome['order']->load('deliverer.user'))));
        }

        return response()->json(['order' => $this->present($outcome['order'])]);
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
     * Remise du colis : le livreur envoie la photo de réception (obligatoire). La livraison passe en « remise » : l'argent
     * reste bloqué chez LIV corp jusqu'à ce que l'EXPÉDITEUR confirme la réception (ou que le délai automatique s'écoule).
     * Le destinataire n'a rien à faire ni besoin de l'application.
     */
    public function deliver(Request $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        $request->validate([
            'delivery_photo' => 'required|image|mimes:jpg,jpeg,png,webp|max:8192',
        ], [
            'delivery_photo.required' => 'Prenez une photo du colis remis : elle prouve la réception.',
            'delivery_photo.image' => 'Le fichier doit être une photo.',
            'delivery_photo.max' => 'Cette photo est trop lourde (8 Mo maximum).',
        ]);

        $outcome = DB::transaction(function () use ($request, $order) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Order::STATUS_EN_COURS_LIVRAISON) {
                return ['error' => 'Cette course n\'est pas en cours de livraison.'];
            }

            $locked->delivery_photo_path = $this->photos->store($request->file('delivery_photo'), 'deliveries');
            $this->statusService->transitionTo($locked, Order::STATUS_REMISE, 'Colis remis, photo de réception envoyée');

            return ['order' => $locked];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        $this->auditLog->log('order.handed_over', $outcome['order']);
        rescue(fn () => $outcome['order']->client->notify(new DeliveryHandedOver($outcome['order']->fresh())));

        return response()->json(['order' => $this->present($outcome['order'])]);
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

            // Retour à une course libre, au prix imposé par LIV corp.
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
