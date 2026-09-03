<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\Order;

/**
 * Calcul et enregistrement des commissions LIV corp sur chaque commande livrée.
 */
class CommissionService
{
    public function computeForDeliveredOrder(Order $order): Commission
    {
        $rate = (float) config('services.commission.rate_default', 15); // %
        $commissionAmount = round($order->price * $rate / 100, 2);
        $netAmount = round($order->price - $commissionAmount, 2);

        $order->update([
            'commission_amount' => $commissionAmount,
            'deliverer_payout' => $netAmount,
        ]);

        return Commission::create([
            'order_id' => $order->id,
            'beneficiary_id' => $order->deliverer->user_id,
            'beneficiary_type' => 'livreur',
            'rate' => $rate,
            'order_amount' => $order->price,
            'commission_amount' => $commissionAmount,
            'net_amount' => $netAmount,
            'status' => 'due',
        ]);
    }
}
