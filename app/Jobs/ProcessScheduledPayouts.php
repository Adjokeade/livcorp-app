<?php

namespace App\Jobs;

use App\Models\Commission;
use App\Models\Payout;
use App\Services\AuditLogService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Prépare les versements aux livreurs : regroupe leurs commissions « due » en un versement EN ATTENTE par livreur.
 * Exécuté chaque soir par le scheduler (routes/console.php) ou à la demande de l'administration.
 *
 * KKiaPay n'a pas d'API pour payer des tiers : ce job ne verse rien. L'administration paie chaque versement en Mobile
 * Money au numéro du livreur, puis le marque comme versé (cf. FinanceController::payPayout).
 *
 * Les commissions sur paiements en espèces sont négatives : elles s'imputent sur les gains en ligne. Si le solde est
 * nul ou négatif, rien n'est préparé et les écritures restent « due » pour être compensées par les prochaines courses.
 */
class ProcessScheduledPayouts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(AuditLogService $auditLog): void
    {
        $due = Commission::where('status', 'due')
            ->with('beneficiary.deliverer', 'beneficiary.merchant')
            ->get()
            ->groupBy('beneficiary_id');

        foreach ($due as $beneficiaryId => $commissions) {
            $beneficiary = $commissions->first()->beneficiary;
            $mobileMoneyNumber = $beneficiary->deliverer->mobile_money_number ?? null;

            if (! $mobileMoneyNumber) {
                Log::warning("Versement ignoré : aucun numéro Mobile Money pour l'utilisateur #{$beneficiaryId}");
                continue;
            }

            DB::transaction(function () use ($commissions, $beneficiary, $mobileMoneyNumber, $auditLog) {
                // Un versement déjà en attente pour ce livreur s'enrichit des nouvelles écritures plutôt que d'en créer un autre.
                $payout = Payout::where('beneficiary_id', $beneficiary->id)->where('status', 'pending')->lockForUpdate()->first();
                $included = $payout ? Commission::where('payout_id', $payout->id)->sum('net_amount') : 0;
                $total = $included + $commissions->sum('net_amount');

                if ($total <= 0) {
                    return;
                }

                $frequency = config('services.commission.payout_frequency', 'weekly');
                [$periodType, $periodStart] = match ($frequency) {
                    'daily' => ['journalier', now()->startOfDay()],
                    'monthly' => ['mensuel', now()->startOfMonth()],
                    default => ['hebdomadaire', now()->startOfWeek()],
                };

                $payout ??= new Payout([
                    'beneficiary_id' => $beneficiary->id,
                    'beneficiary_type' => $commissions->first()->beneficiary_type,
                    'period_type' => $periodType,
                    'period_start' => $periodStart,
                    'status' => 'pending',
                ]);
                $payout->fill(['total_amount' => $total, 'period_end' => now(), 'mobile_money_number' => $mobileMoneyNumber])->save();

                $commissions->toQuery()->update(['status' => 'included_in_payout', 'payout_id' => $payout->id]);

                $auditLog->log('payout.prepared', $payout, ['amount' => $total]);
            });
        }
    }
}
