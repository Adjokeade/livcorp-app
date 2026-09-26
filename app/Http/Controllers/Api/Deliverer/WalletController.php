<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Payout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Portefeuille du livreur : gains par course (net de commission), solde,
 * versements Mobile Money et numéro de réception. Le solde est un grand livre :
 * positif quand LIV corp doit de l'argent au livreur (paiements en ligne),
 * négatif quand le livreur doit sa commission sur des paiements en espèces.
 */
class WalletController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();
        $deliverer = $user->deliverer;

        // Remet le cache à jour : couvre les commissions antérieures à cette fonctionnalité.
        $deliverer->refreshStats();

        $commissions = Commission::where('beneficiary_id', $user->id)->where('beneficiary_type', 'livreur');

        return response()->json([
            'balance' => (float) $deliverer->wallet_balance,
            // Gains = prix moins commission, sur toutes les courses payées, quel que soit le mode de paiement.
            'total_earned' => (float) (clone $commissions)->sum(DB::raw('order_amount - commission_amount')),
            // Versé = paiements en ligne effectivement reversés (les écritures négatives sont des espèces).
            'total_paid' => (float) (clone $commissions)->where('status', 'paid')->where('net_amount', '>', 0)->sum('net_amount'),
            // Espèces encaissées auprès des clients : le livreur les détient déjà.
            'cash_collected' => (float) (clone $commissions)->where('net_amount', '<', 0)->sum('order_amount'),
            'commission_rate' => (float) config('services.commission.rate_default', 15),
            'mobile_money_number' => $deliverer->mobile_money_number,
            'earnings' => (clone $commissions)
                ->with('order:id,reference,pickup_address,dropoff_address,delivered_at')
                ->latest()
                ->limit(20)
                ->get()
                ->map(fn (Commission $c) => [
                    'id' => $c->id,
                    'order_reference' => $c->order?->reference,
                    'pickup_address' => $c->order?->pickup_address,
                    'dropoff_address' => $c->order?->dropoff_address,
                    'order_amount' => (float) $c->order_amount,
                    'commission_amount' => (float) $c->commission_amount,
                    'net_amount' => (float) $c->net_amount,
                    'payment_method' => $c->net_amount < 0 ? 'especes' : 'en_ligne',
                    'status' => $c->status,
                    'created_at' => $c->created_at,
                ]),
            'payouts' => Payout::where('beneficiary_id', $user->id)
                ->latest()
                ->limit(10)
                ->get(['id', 'total_amount', 'status', 'mobile_money_number', 'paid_at', 'created_at']),
        ]);
    }

    /**
     * Enregistre le numéro qui recevra les versements. Accepte les formats de
     * saisie courants (+229 01 46 62 05 83, 0146620583, 229 61 23 45 67…) et
     * stocke le numéro national, car FedaPay reçoit le pays à part (cf. createPayout).
     */
    public function updateMobileMoney(Request $request)
    {
        $digits = preg_replace('/\D+/', '', (string) $request->input('mobile_money_number'));

        if (str_starts_with($digits, '00229')) {
            $digits = substr($digits, 5);
        } elseif (str_starts_with($digits, '229') && strlen($digits) > 10) {
            $digits = substr($digits, 3);
        }

        if (! preg_match('/^(\d{8}|\d{10})$/', $digits)) {
            throw ValidationException::withMessages([
                'mobile_money_number' => 'Saisissez un numéro béninois valide (8 ou 10 chiffres).',
            ]);
        }

        $request->user()->deliverer->update(['mobile_money_number' => $digits]);

        return response()->json(['mobile_money_number' => $digits]);
    }
}
