<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OnlinePaymentService;
use App\Services\OrderStatusService;
use Illuminate\Http\Request;

/** Suivi de toutes les livraisons de la plateforme et annulation d'autorité par l'administrateur. */
class OrderController extends Controller
{
    public function __construct(
        private readonly OrderStatusService $statusService,
        private readonly AuditLogService $auditLog,
        private readonly OnlinePaymentService $payments,
    ) {}

    public function index(Request $request)
    {
        $filters = $request->validate([
            'q' => 'nullable|string|max:100',
            'status' => 'nullable|in:creee,acceptee,colis_recupere,en_cours_livraison,remise,livree,annulee,litige',
        ]);

        return Order::query()
            ->with(['client:id,first_name,last_name,company_name', 'deliverer:id,user_id', 'deliverer.user:id,first_name,last_name'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('reference', 'like', $like)->orWhere('recipient_name', 'like', $like)
                    ->orWhere('pickup_address', 'like', $like)->orWhere('dropoff_address', 'like', $like)
                    ->orWhereHas('client', fn ($c) => $c->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)->orWhere('company_name', 'like', $like)));
            })
            ->latest()
            ->paginate(20)
            ->through(fn (Order $o) => [
                'id' => $o->id,
                'reference' => $o->reference,
                'type' => $o->type,
                'urgency' => $o->urgency,
                'status' => $o->status,
                'payment_status' => $o->payment_status,
                'price' => $o->price,
                'price_suggested' => $o->price_suggested,
                'handed_over_at' => $o->handed_over_at,
                'distance_km' => $o->distance_km,
                'pickup_address' => $o->pickup_address,
                'dropoff_address' => $o->dropoff_address,
                'recipient_name' => $o->recipient_name,
                'created_at' => $o->created_at,
                'client' => $o->client ? ['id' => $o->client->id, 'name' => $o->client->company_name ?: trim($o->client->first_name.' '.$o->client->last_name)] : null,
                'deliverer' => $o->deliverer?->user ? ['id' => $o->deliverer->id, 'name' => trim($o->deliverer->user->first_name.' '.$o->deliverer->user->last_name)] : null,
            ]);
    }

    /** Annulation par l'administrateur : possible tant que le colis n'est pas livré, motif obligatoire (tracé). */
    public function cancel(Request $request, Order $order)
    {
        $validated = $request->validate(['reason' => 'required|string|max:300']);

        if (! $order->canTransitionTo(Order::STATUS_ANNULEE)) {
            return response()->json(['message' => 'Cette livraison ne peut plus être annulée.'], 422);
        }

        $this->statusService->transitionTo($order, Order::STATUS_ANNULEE, 'Annulée par LIV corp : '.$validated['reason']);
        $this->auditLog->log('admin.order.cancelled', $order, ['reason' => $validated['reason']]);

        // L'argent bloqué chez LIV corp est rendu au client.
        $this->payments->cancelUnpaid($order);
        $refund = $this->payments->refundOrder($order->fresh(), 'Annulée par LIV corp : '.$validated['reason']);

        return response()->json(['status' => $order->fresh()->status, 'refund' => $refund]);
    }
}
