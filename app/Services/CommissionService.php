<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\Order;

/**
 * Calcul et enregistrement des commissions LIV corp sur chaque commande livrée.
 */
class CommissionService
{
    /**
     * Écriture au grand livre du livreur, à la livraison. Deux cas :
     *  - paiement en ligne : LIV corp détient l'argent, il doit au livreur le net
     *    (net_amount positif, versé par ProcessScheduledPayouts) ;
     *  - paiement en espèces : le livreur a déjà encaissé 100 % du prix, c'est lui
     *    qui doit sa commission à LIV corp (net_amount négatif, déduit de ses
     *    prochains versements).
     * Une commande non payée n'a rien encaissé : pas de commission.
     */
    public function computeForDeliveredOrder(Order $order): ?Commission
    {
        if (! $order->isPaid()) {
            return null;
        }

        // Une commande passée en litige puis re-livrée ne doit pas être commissionnée deux fois.
        $existing = Commission::where('order_id', $order->id)->where('beneficiary_type', 'livreur')->first();
        if ($existing) {
            return $existing;
        }

        $rate = (float) config('services.commission.rate_default', 15); // %
        $commissionAmount = round($order->price * $rate / 100, 2);
        $earnings = round($order->price - $commissionAmount, 2);

        // deliverer_payout = ce que le livreur gagne sur la course, quel que soit le mode de paiement.
        $order->update([
            'commission_amount' => $commissionAmount,
            'deliverer_payout' => $earnings,
        ]);

        $netAmount = $order->payment_method === 'especes' ? -$commissionAmount : $earnings;

        $commission = Commission::create([
            'order_id' => $order->id,
            'beneficiary_id' => $order->deliverer->user_id,
            'beneficiary_type' => 'livreur',
            'rate' => $rate,
            'order_amount' => $order->price,
            'commission_amount' => $commissionAmount,
            'net_amount' => $netAmount,
            'status' => 'due',
        ]);

        // Livraison comptée et gain crédité au portefeuille du livreur.
        $order->deliverer->refreshStats();

        return $commission;
    }
}
