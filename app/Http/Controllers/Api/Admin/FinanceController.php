<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessScheduledPayouts;
use App\Models\Commission;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Transaction;
use App\Models\User;
use App\Notifications\PayoutSent;
use App\Services\AuditLogService;
use App\Services\FinanceSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Finances de la plateforme : commissions perçues, sommes dues aux livreurs, versements, taux de commission.
 *
 * Deux flux : un paiement EN LIGNE passe par LIV corp, qui doit ensuite le net au livreur (net positif) ; un
 * paiement en ESPÈCES est encaissé par le livreur, qui doit sa commission à LIV corp (net négatif, imputé sur ses
 * prochains versements).
 */
class FinanceController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function summary(Request $request)
    {
        $period = $request->validate(['period' => 'nullable|in:week,month,year,all'])['period'] ?? 'month';
        $since = match ($period) {
            'week' => now()->subDays(7)->startOfDay(),
            'year' => now()->subYear(),
            'all' => null,
            default => now()->subMonth()->startOfDay(),
        };

        $inPeriod = fn () => Commission::where('beneficiary_type', 'livreur')->when($since, fn ($q) => $q->where('created_at', '>=', $since));
        $online = fn ($q) => $q->where('net_amount', '>', 0);
        $cash = fn ($q) => $q->where('net_amount', '<=', 0);
        $open = fn () => Commission::where('beneficiary_type', 'livreur')->whereIn('status', ['due', 'included_in_payout']);

        $byDay = $inPeriod()
            ->selectRaw('date(created_at) as day, sum(commission_amount) as commission, sum(order_amount) as volume, count(*) as deliveries')
            ->groupBy('day')->orderBy('day')->get()
            ->map(fn ($r) => ['day' => $r->day, 'commission' => (float) $r->commission, 'volume' => (float) $r->volume, 'deliveries' => (int) $r->deliveries]);

        return [
            'period' => $period,
            'commission_rate' => FinanceSettings::commissionRate(),
            // Activité de la période.
            'deliveries' => $inPeriod()->count(),
            'volume' => (float) $inPeriod()->sum('order_amount'),
            'commission_total' => (float) $inPeriod()->sum('commission_amount'),
            'volume_online' => (float) $online($inPeriod())->sum('order_amount'),
            'volume_cash' => (float) $cash($inPeriod())->sum('order_amount'),
            'paid_out' => (float) Payout::where('status', 'paid')->when($since, fn ($q) => $q->where('paid_at', '>=', $since))->sum('total_amount'),
            // Situation actuelle (indépendante de la période).
            'owed_to_deliverers' => (float) $online($open())->sum('net_amount'),
            'owed_by_deliverers' => abs((float) $cash($open())->where('net_amount', '<', 0)->sum('net_amount')),
            'failed_payouts' => Payout::where('status', 'failed')->count(),
            'refunds_to_do' => Transaction::where('refund_status', 'manual')->count(),
            // Argent encaissé et gardé chez LIV corp : livraisons payées dont la réception n'est pas encore confirmée.
            'held_amount' => (float) Order::where('payment_status', 'paye')->whereNotIn('status', [Order::STATUS_LIVREE, Order::STATUS_ANNULEE])->sum('price'),
            'processing_payouts' => Payout::whereIn('status', ['pending', 'processing'])->count(),
            'by_day' => $byDay,
            'top_balances' => $this->balances(),
        ];
    }

    /** Livreurs auxquels LIV corp doit de l'argent (ou qui lui en doivent), du plus gros solde au plus petit. */
    private function balances(): array
    {
        return Commission::where('beneficiary_type', 'livreur')->whereIn('status', ['due', 'included_in_payout'])
            ->select('beneficiary_id', DB::raw('sum(net_amount) as balance'), DB::raw('count(*) as entries'))
            ->groupBy('beneficiary_id')->orderByDesc('balance')->limit(10)->get()
            ->map(function ($row) {
                $user = User::with('deliverer:id,user_id,mobile_money_number')->find($row->beneficiary_id);

                return [
                    'deliverer_id' => $user?->deliverer?->id,
                    'name' => $user ? trim($user->first_name.' '.$user->last_name) : '—',
                    'balance' => (float) $row->balance,
                    'entries' => (int) $row->entries,
                    'has_mobile_money' => filled($user?->deliverer?->mobile_money_number),
                ];
            })->all();
    }

    public function commissions(Request $request)
    {
        $filters = $request->validate([
            'q' => 'nullable|string|max:100',
            'status' => 'nullable|in:due,included_in_payout,paid',
            'kind' => 'nullable|in:en_ligne,especes',
        ]);

        return Commission::query()
            ->where('beneficiary_type', 'livreur')
            ->with(['order:id,reference', 'beneficiary:id,first_name,last_name', 'beneficiary.deliverer:id,user_id'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['kind'] ?? null, fn ($q, $kind) => $kind === 'especes' ? $q->where('net_amount', '<=', 0) : $q->where('net_amount', '>', 0))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->whereHas('order', fn ($o) => $o->where('reference', 'like', $like))
                    ->orWhereHas('beneficiary', fn ($u) => $u->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)));
            })
            ->latest()
            ->paginate(20)
            ->through(fn (Commission $c) => [
                'id' => $c->id,
                'order_reference' => $c->order?->reference,
                'deliverer' => ['id' => $c->beneficiary?->deliverer?->id, 'name' => $c->beneficiary ? trim($c->beneficiary->first_name.' '.$c->beneficiary->last_name) : '—'],
                'rate' => (float) $c->rate,
                'order_amount' => (float) $c->order_amount,
                'commission_amount' => (float) $c->commission_amount,
                'net_amount' => (float) $c->net_amount,
                'kind' => $c->net_amount < 0 ? 'especes' : 'en_ligne',
                'status' => $c->status,
                'created_at' => $c->created_at,
            ]);
    }

    public function payouts(Request $request)
    {
        $filters = $request->validate(['status' => 'nullable|in:pending,processing,paid,failed']);

        return Payout::query()
            ->with(['beneficiary:id,first_name,last_name', 'beneficiary.deliverer:id,user_id'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->latest()
            ->paginate(20)
            ->through(fn (Payout $p) => [
                'id' => $p->id,
                'deliverer' => ['id' => $p->beneficiary?->deliverer?->id, 'name' => $p->beneficiary ? trim($p->beneficiary->first_name.' '.$p->beneficiary->last_name) : '—'],
                'total_amount' => (float) $p->total_amount,
                'status' => $p->status,
                'period_type' => $p->period_type,
                'period_start' => $p->period_start,
                'period_end' => $p->period_end,
                'mobile_money_number' => $p->mobile_money_number,
                'reference' => $p->reference,
                'paid_at' => $p->paid_at,
                'created_at' => $p->created_at,
            ]);
    }

    /**
     * L'administration a payé le versement en Mobile Money (hors application, KKiaPay ne verse pas à des tiers) : on le
     * marque comme versé, ses commissions sont réglées et le livreur est prévenu. `reference` = référence de l'opérateur.
     */
    public function payPayout(Request $request, Payout $payout)
    {
        $validated = $request->validate(['reference' => 'nullable|string|max:100']);

        if ($payout->status !== 'pending') {
            return response()->json(['message' => 'Ce versement n\'est pas en attente.'], 422);
        }

        DB::transaction(function () use ($payout, $validated, $request) {
            $payout->update([
                'status' => 'paid',
                'paid_at' => now(),
                'paid_by' => $request->user()->id,
                'reference' => $validated['reference'] ?? null,
            ]);
            Commission::where('payout_id', $payout->id)->update(['status' => 'paid']);
        });

        $payout->beneficiary?->deliverer?->refreshStats();
        $this->auditLog->log('payout.paid', $payout, ['amount' => $payout->total_amount, 'reference' => $validated['reference'] ?? null]);
        rescue(fn () => $payout->beneficiary?->notify(new PayoutSent($payout)));

        return ['id' => $payout->id, 'status' => 'paid'];
    }

    /** Annule un versement en attente : ses commissions reviennent « à verser » et seront regroupées au prochain passage. */
    public function cancelPayout(Request $request, Payout $payout)
    {
        if ($payout->status !== 'pending') {
            return response()->json(['message' => 'Ce versement n\'est pas en attente.'], 422);
        }

        DB::transaction(function () use ($payout) {
            Commission::where('payout_id', $payout->id)->update(['status' => 'due', 'payout_id' => null]);
            $payout->update(['status' => 'failed']);
        });

        $this->auditLog->log('payout.cancelled', $payout);

        return ['id' => $payout->id, 'status' => 'failed'];
    }

    /** Remboursements de clients à faire à la main (carte, envoi en lot, remboursement partiel, panne de l'API). */
    public function refunds()
    {
        return Transaction::where('refund_status', 'manual')->with(['user:id,first_name,last_name,company_name'])->latest()->get()
            ->map(fn (Transaction $t) => [
                'id' => $t->id,
                'reference' => $t->reference,
                'amount' => (float) $t->amount,
                'orders' => Order::where('transaction_id', $t->id)->pluck('reference'),
                'client' => $t->user ? ($t->user->company_name ?: trim($t->user->first_name.' '.$t->user->last_name)) : '—',
                'note' => $t->refund_note,
                'method' => $t->method,
                'provider_transaction_id' => $t->provider_transaction_id,
                'created_at' => $t->created_at,
            ]);
    }

    public function refundDone(Transaction $transaction)
    {
        abort_unless($transaction->refund_status === 'manual', 422, 'Aucun remboursement à faire sur cette transaction.');

        $transaction->update(['refund_status' => 'done']);
        $this->auditLog->log('payment.refund_done_manually', $transaction);

        return ['id' => $transaction->id, 'refund_status' => 'done'];
    }

    /** Prépare tout de suite les versements dus (d'ordinaire planifié chaque jour à 20 h). */
    public function runPayouts(Request $request)
    {
        $this->auditLog->log('admin.payouts.run');
        ProcessScheduledPayouts::dispatch();

        return response()->json(['message' => 'Préparation des versements lancée : ils apparaissent « en attente » dans quelques instants, prêts à être payés en Mobile Money.'], 202);
    }

    public function settings()
    {
        return ['commission_rate' => FinanceSettings::commissionRate(), 'default_rate' => (float) config('services.commission.rate_default', 15)];
    }

    /** Le nouveau taux ne s'applique qu'aux livraisons à venir : chaque commission déjà enregistrée garde son taux. */
    public function updateSettings(Request $request)
    {
        $validated = $request->validate(['commission_rate' => 'required|numeric|min:0|max:50']);

        $previous = FinanceSettings::commissionRate();
        FinanceSettings::setCommissionRate((float) $validated['commission_rate'], $request->user()->id);
        $this->auditLog->log('admin.commission_rate.updated', null, ['from' => $previous, 'to' => (float) $validated['commission_rate']]);

        return $this->settings();
    }
}
