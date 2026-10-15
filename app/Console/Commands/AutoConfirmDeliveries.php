<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Notifications\DeliveryConfirmed;
use App\Services\AuditLogService;
use App\Services\OrderStatusService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Confirme d'office la réception quand l'expéditeur n'a pas répondu dans le délai (ORDER_AUTO_CONFIRM_HOURS, 24 h par
 * défaut) : sans cela, un expéditeur qui ne répond jamais bloquerait indéfiniment l'argent du livreur. Un litige ouvert
 * avant l'échéance (statut « litige ») n'est évidemment pas confirmé.
 */
class AutoConfirmDeliveries extends Command
{
    protected $signature = 'orders:auto-confirm';

    protected $description = "Confirme la réception des colis remis dont l'expéditeur n'a pas répondu à temps";

    public function handle(OrderStatusService $statuses, AuditLogService $audit): int
    {
        $hours = (int) config('services.orders.auto_confirm_hours');
        if ($hours <= 0) {
            $this->warn('Confirmation automatique désactivée (ORDER_AUTO_CONFIRM_HOURS=0).');

            return self::SUCCESS;
        }

        $confirmed = 0;

        Order::where('status', Order::STATUS_REMISE)->where('handed_over_at', '<=', now()->subHours($hours))->get()
            ->each(function (Order $order) use ($statuses, $audit, &$confirmed) {
                $done = DB::transaction(function () use ($order, $statuses) {
                    $locked = Order::whereKey($order->id)->lockForUpdate()->first();
                    if ($locked->status !== Order::STATUS_REMISE) {
                        return null; // confirmé ou contesté à l'instant
                    }

                    return $statuses->transitionTo($locked, Order::STATUS_LIVREE, 'Réception confirmée automatiquement (sans réponse de l\'expéditeur)');
                });

                if ($done) {
                    $confirmed++;
                    $audit->log('order.delivery_confirmed', $done, ['by' => 'auto']);
                    rescue(fn () => $done->deliverer?->user?->notify(new DeliveryConfirmed($done, automatic: true)));
                }
            });

        $this->info("{$confirmed} réception(s) confirmée(s) automatiquement.");

        return self::SUCCESS;
    }
}
