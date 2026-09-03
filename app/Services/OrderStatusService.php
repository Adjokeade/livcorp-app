<?php

namespace App\Services;

use App\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Notifications\OrderStatusUpdatedForClient;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Fait respecter la machine à états des commandes (cf. Order::ALLOWED_TRANSITIONS)
 * et garantit l'horodatage systématique de chaque transition (cahier des charges §3.5).
 */
class OrderStatusService
{
    public function __construct(
        private readonly CommissionService $commissionService,
        private readonly AuditLogService $auditLog,
    ) {}

    public function transitionTo(Order $order, string $newStatus, ?string $note = null): Order
    {
        if (! $order->canTransitionTo($newStatus)) {
            throw new InvalidArgumentException(
                "Transition invalide : {$order->status} → {$newStatus}."
            );
        }

        return DB::transaction(function () use ($order, $newStatus, $note) {
            $previousStatus = $order->status;

            $timestampField = match ($newStatus) {
                Order::STATUS_ACCEPTEE => 'accepted_at',
                Order::STATUS_COLIS_RECUPERE => 'picked_up_at',
                Order::STATUS_LIVREE => 'delivered_at',
                Order::STATUS_ANNULEE => 'cancelled_at',
                default => null,
            };

            $order->status = $newStatus;
            if ($timestampField) {
                $order->{$timestampField} = now();
            }
            $order->save();

            OrderStatusHistory::create([
                'order_id' => $order->id,
                'status' => $newStatus,
                'changed_by' => Auth::id(),
                'note' => $note,
                'created_at' => now(),
            ]);

            // Déclenche le calcul de commission dès la livraison effective
            if ($newStatus === Order::STATUS_LIVREE) {
                $this->commissionService->computeForDeliveredOrder($order);
            }

            $this->auditLog->log('order.status_changed', $order, [
                'from' => $previousStatus,
                'to' => $newStatus,
            ]);

            // Suivi temps réel côté client (carte + statut vivant)
            broadcast(new OrderStatusChanged($order, $previousStatus))->toOthers();

            // E-mail personnalisé et chaleureux à chaque étape clé
            $order->client->notify(new OrderStatusUpdatedForClient($order));

            return $order->fresh();
        });
    }
}
