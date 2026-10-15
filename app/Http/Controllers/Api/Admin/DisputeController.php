<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Notifications\DeliveryConfirmed;
use App\Services\OnlinePaymentService;
use App\Services\OrderStatusService;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class DisputeController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        return Dispute::with(['order', 'raisedBy', 'assignedTo'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->latest()
            ->paginate(15);
    }

    public function assign(Request $request, Dispute $dispute)
    {
        $validated = $request->validate(['assigned_to' => 'required|exists:users,id']);
        $dispute->update(['assigned_to' => $validated['assigned_to'], 'status' => 'en_cours']);

        $this->auditLog->log('dispute.assigned', $dispute, $validated);

        return $dispute->fresh(['assignedTo']);
    }

    /**
     * Tranche un litige. L'argent de la livraison est bloqué chez LIV corp : la décision dit à qui il va.
     *  - remboursement total : la livraison est annulée et le client est remboursé ;
     *  - remboursement partiel : le colis est considéré livré (le livreur est payé), le remboursement partiel du client est
     *    noté « à faire » (l'API ne rembourse que la transaction entière) ;
     *  - sans suite / autre : si le colis a bien été remis (photo de réception), la livraison est confirmée et le livreur payé.
     */
    public function resolve(Request $request, Dispute $dispute, OnlinePaymentService $payments, OrderStatusService $statuses)
    {
        $validated = $request->validate([
            'resolution' => 'required|in:remboursement_total,remboursement_partiel,sans_suite,autre',
            'resolution_note' => 'nullable|string|max:1000',
        ]);

        $dispute->update([
            ...$validated,
            'status' => 'resolu',
            'resolved_at' => now(),
        ]);

        $this->auditLog->log('dispute.resolved', $dispute, $validated);

        $refund = ['status' => 'none', 'message' => 'Aucun remboursement demandé.'];
        $order = $dispute->order;

        if ($order->status === Order::STATUS_LITIGE) {
            if ($validated['resolution'] === 'remboursement_total') {
                $statuses->transitionTo($order, Order::STATUS_ANNULEE, 'Litige tranché : remboursement du client');
                $refund = $payments->refundOrder($order->fresh(), 'Litige : remboursement total');
            } elseif ($order->delivery_photo_path) {
                $statuses->transitionTo($order, Order::STATUS_LIVREE, 'Litige tranché : livraison confirmée');
                rescue(fn () => $order->deliverer?->user?->notify(new DeliveryConfirmed($order->fresh())));

                if ($validated['resolution'] === 'remboursement_partiel' && $order->payment) {
                    $order->payment->update(['refund_status' => 'manual', 'refund_note' => 'Remboursement partiel décidé suite au litige : montant à déterminer.']);
                    $refund = ['status' => 'manual', 'message' => 'Remboursement partiel à faire depuis le tableau de bord KKiaPay (Finances > Remboursements).'];
                }
            }
        }

        return [...$dispute->fresh()->toArray(), 'refund' => $refund];
    }
}
