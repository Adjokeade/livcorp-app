<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\OnlinePaymentService;
use App\Services\OrderStatusService;
use Illuminate\Console\Command;

/** Annule les livraisons créées mais jamais payées (délai : ORDER_UNPAID_EXPIRY_MINUTES, 30 min par défaut). */
class ExpireUnpaidOrders extends Command
{
    protected $signature = 'orders:expire-unpaid';

    protected $description = 'Annule les livraisons non payées après le délai de paiement';

    public function handle(OrderStatusService $statuses, OnlinePaymentService $payments): int
    {
        $limit = now()->subMinutes((int) config('services.orders.unpaid_expiry_minutes'));
        $expired = 0;

        Order::where('status', Order::STATUS_CREEE)->whereIn('payment_status', ['en_attente', 'echoue'])->where('created_at', '<=', $limit)
            ->where(fn ($q) => $q->whereNull('payment_method')->orWhere('payment_method', '!=', 'especes'))->get()
            ->each(function (Order $order) use ($statuses, $payments, &$expired) {
                $payments->cancelUnpaid($order);
                $statuses->transitionTo($order, Order::STATUS_ANNULEE, 'Annulée : paiement non effectué dans le délai');
                $expired++;
            });

        $this->info("{$expired} livraison(s) non payée(s) annulée(s).");

        return self::SUCCESS;
    }
}
