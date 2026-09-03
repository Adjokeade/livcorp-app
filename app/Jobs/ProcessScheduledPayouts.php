<?php

namespace App\Jobs;

use App\Models\Commission;
use App\Models\Payout;
use App\Services\AuditLogService;
use App\Services\FedaPayService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Regroupe les commissions "due" par bénéficiaire et déclenche les reversements
 * Mobile Money via FedaPay. Exécuté par le scheduler (routes/console.php).
 * Cf. cahier des charges §3.4 : "Calcul automatique des commissions et gestion
 * des versements (périodicité journalière ou mensuelle)".
 */
class ProcessScheduledPayouts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(FedaPayService $fedapay, AuditLogService $auditLog): void
    {
        $dueCommissions = Commission::where('status', 'due')
            ->with('beneficiary.deliverer', 'beneficiary.merchant')
            ->get()
            ->groupBy('beneficiary_id');

        foreach ($dueCommissions as $beneficiaryId => $commissions) {
            $beneficiary = $commissions->first()->beneficiary;
            $mobileMoneyNumber = $beneficiary->deliverer->mobile_money_number
                ?? null;

            if (! $mobileMoneyNumber) {
                Log::warning("Payout ignoré : aucun numéro Mobile Money pour l'utilisateur #{$beneficiaryId}");
                continue;
            }

            $totalAmount = $commissions->sum('net_amount');

            DB::transaction(function () use ($commissions, $beneficiary, $mobileMoneyNumber, $totalAmount, $fedapay, $auditLog) {
                $payout = Payout::create([
                    'beneficiary_id' => $beneficiary->id,
                    'beneficiary_type' => $commissions->first()->beneficiary_type,
                    'total_amount' => $totalAmount,
                    'period_type' => config('services.commission.payout_frequency', 'weekly'),
                    'period_start' => now()->startOfWeek(),
                    'period_end' => now(),
                    'status' => 'processing',
                    'mobile_money_number' => $mobileMoneyNumber,
                ]);

                $commissions->toQuery()->update([
                    'status' => 'included_in_payout',
                    'payout_id' => $payout->id,
                ]);

                try {
                    $result = $fedapay->createPayout(
                        $mobileMoneyNumber,
                        $totalAmount,
                        "Versement LIV corp — {$payout->period_start->format('d/m/Y')} au {$payout->period_end->format('d/m/Y')}"
                    );

                    $payout->update([
                        'status' => 'paid',
                        'fedapay_payout_id' => $result['id'] ?? null,
                        'fedapay_payload' => $result,
                        'paid_at' => now(),
                    ]);
                    $commissions->toQuery()->update(['status' => 'paid']);

                    $auditLog->log('payout.processed', $payout, ['amount' => $totalAmount]);
                } catch (\Throwable $e) {
                    $payout->update(['status' => 'failed']);
                    Log::error("Échec du payout #{$payout->id}: {$e->getMessage()}");
                }
            });
        }
    }
}
