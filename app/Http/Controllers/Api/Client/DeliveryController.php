<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Notifications\DeliveryRetryRequested;
use App\Services\AuditLogService;
use App\Services\OrderStatusService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Après un "destinataire injoignable", le client confirme qu'il est joignable et la livraison reprend.
 */
class DeliveryController extends Controller
{
    private const MAX_RETRIES = 2;

    public function __construct(
        private readonly OrderStatusService $statusService,
        private readonly AuditLogService $auditLog,
    ) {}

    public function retry(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        $outcome = DB::transaction(function () use ($order) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Order::STATUS_LITIGE || ! $locked->failed_delivery_at) {
                return ['error' => 'Aucune livraison en attente sur cette commande.'];
            }

            $retries = Dispute::where('order_id', $locked->id)->where('resolution_note', 'Nouvelle tentative demandée par le client')->count();
            if ($retries >= self::MAX_RETRIES) {
                return ['error' => 'Le nombre de nouvelles tentatives est atteint : notre équipe va vous contacter.'];
            }

            Dispute::where('order_id', $locked->id)->where('reason', 'colis_non_livre')->whereIn('status', ['ouvert', 'en_cours'])->update([
                'status' => 'resolu',
                'resolution' => 'autre',
                'resolution_note' => 'Nouvelle tentative demandée par le client',
                'resolved_at' => now(),
            ]);

            // Le livreur doit re-signaler son arrivée : l'attente repart de zéro.
            $locked->forceFill(['failed_delivery_at' => null, 'dropoff_arrived_at' => null]);
            $this->statusService->transitionTo($locked, Order::STATUS_EN_COURS_LIVRAISON, 'Nouvelle tentative de remise demandée par le client');

            return ['order' => $locked];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        $this->auditLog->log('order.delivery_retry', $outcome['order']);
        rescue(fn () => $outcome['order']->deliverer?->user?->notify(new DeliveryRetryRequested($outcome['order'])));

        return response()->json(['order' => $outcome['order']->fresh([...Order::DELIVERER_PUBLIC, 'statusHistory'])->makeVisible('delivery_code')->maskContacts()]);
    }
}
