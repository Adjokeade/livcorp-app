<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Commission;
use App\Models\Deliverer;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderRelease;
use App\Models\Payout;
use App\Models\Review;
use Illuminate\Http\Request;

/** Annuaire de tous les livreurs (la validation des dossiers en attente est dans DelivererValidationController). */
class DelivererController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'q' => 'nullable|string|max:100',
            'status' => 'nullable|in:pending,approved,rejected',
        ]);

        return Deliverer::query()
            ->with(['user:id,first_name,last_name,email,phone,is_active,avatar_path', 'user.documents:id,user_id,type,status'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('verification_status', $status))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->whereHas('user', fn ($u) => $u->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                    ->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like));
            })
            ->withCount(['orders as in_progress_count' => fn ($q) => $q->whereIn('status', ['acceptee', 'colis_recupere', 'en_cours_livraison'])])
            ->latest()
            ->paginate(20);
    }

    /**
     * Fiche complète d'un livreur pour l'administration : identité, dossier, fiabilité, gains, dernières
     * livraisons et avis, versements et historique des décisions prises sur son compte.
     */
    public function show(Deliverer $deliverer)
    {
        $deliverer->load(['user', 'user.documents:id,user_id,type,status,created_at', 'verifier:id,first_name,last_name']);
        $user = $deliverer->user;

        $orders = $deliverer->orders();
        $delivered = (clone $orders)->where('status', Order::STATUS_LIVREE)->count();
        $cancelled = (clone $orders)->where('status', Order::STATUS_ANNULEE)->count();
        $inProgress = (clone $orders)->whereIn('status', [Order::STATUS_ACCEPTEE, Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON])->count();
        $releases = OrderRelease::where('deliverer_id', $deliverer->id);
        $accepted = $delivered + $cancelled + $inProgress + (clone $releases)->count();

        $commissions = Commission::where('beneficiary_id', $user->id)->where('beneficiary_type', 'livreur');
        $distribution = Review::where('deliverer_id', $deliverer->id)->selectRaw('rating, count(*) as total')->groupBy('rating')->pluck('total', 'rating');

        return [
            'deliverer' => [
                'id' => $deliverer->id,
                'verification_status' => $deliverer->verification_status,
                'rejection_reason' => $deliverer->rejection_reason,
                'verified_at' => $deliverer->verified_at,
                'verified_by' => $deliverer->verifier ? trim($deliverer->verifier->first_name.' '.$deliverer->verifier->last_name) : null,
                'vehicle_type' => $deliverer->vehicle_type,
                'vehicle_plate' => $deliverer->vehicle_plate,
                'emergency_phone' => $deliverer->emergency_phone,
                'mobile_money_number' => $deliverer->mobile_money_number,
                'is_available' => (bool) $deliverer->is_available,
                'location' => $deliverer->current_lat !== null ? [
                    'lat' => (float) $deliverer->current_lat, 'lng' => (float) $deliverer->current_lng, 'updated_at' => $deliverer->location_updated_at,
                ] : null,
                'created_at' => $deliverer->created_at,
            ],
            'user' => $user->only(['id', 'first_name', 'last_name', 'sex', 'email', 'phone', 'address', 'is_active', 'email_verified_at', 'last_login_at', 'created_at', 'avatar_url']),
            'documents' => $user->documents->map->only(['id', 'type', 'status', 'created_at'])->values(),
            'stats' => [
                'delivered' => $delivered,
                'in_progress' => $inProgress,
                'cancelled' => $cancelled,
                'releases' => (clone $releases)->count(),
                'releases_by_reason' => (clone $releases)->selectRaw('reason, count(*) as total')->groupBy('reason')->pluck('total', 'reason'),
                'disputes' => Dispute::whereIn('order_id', $deliverer->orders()->select('id'))->count(),
                // Part des courses acceptées menées à terme : le meilleur indicateur de fiabilité.
                'completion_rate' => $accepted > 0 ? round($delivered / $accepted * 100) : null,
                'total_km' => round((float) (clone $orders)->where('status', Order::STATUS_LIVREE)->sum('distance_km'), 1),
                'average_rating' => (float) $deliverer->average_rating,
                'reviews_count' => $distribution->sum(),
                'rating_distribution' => collect([5, 4, 3, 2, 1])->mapWithKeys(fn ($n) => [$n => (int) ($distribution[$n] ?? 0)]),
            ],
            'earnings' => [
                'earned_total' => (float) (clone $commissions)->sum(\Illuminate\Support\Facades\DB::raw('order_amount - commission_amount')), // gagné par le livreur, net de commission, tous modes de paiement
                'commission_total' => (float) (clone $commissions)->sum('commission_amount'), // part LIV corp
                // Solde : positif = LIV corp doit au livreur (paiements en ligne) ; négatif = le livreur doit sa commission (espèces).
                'balance_due' => (float) (clone $commissions)->whereIn('status', ['due', 'included_in_payout'])->sum('net_amount'),
                'paid_out' => (float) Payout::where('beneficiary_id', $user->id)->where('status', 'paid')->sum('total_amount'),
            ],
            'recent_orders' => $deliverer->orders()->with('client:id,first_name,last_name,company_name')->latest()->limit(10)->get()->map(fn (Order $o) => [
                'id' => $o->id, 'reference' => $o->reference, 'status' => $o->status, 'price' => $o->price,
                'pickup_address' => $o->pickup_address, 'dropoff_address' => $o->dropoff_address,
                'distance_km' => $o->distance_km, 'created_at' => $o->created_at, 'delivered_at' => $o->delivered_at,
                'client' => $o->client ? ($o->client->company_name ?: trim($o->client->first_name.' '.$o->client->last_name)) : null,
            ]),
            'recent_reviews' => Review::where('deliverer_id', $deliverer->id)->with('client:id,first_name')->latest()->limit(5)->get()
                ->map(fn (Review $r) => ['rating' => $r->rating, 'comment' => $r->comment, 'client' => $r->client?->first_name, 'created_at' => $r->created_at]),
            'payouts' => Payout::where('beneficiary_id', $user->id)->latest()->limit(5)->get(['id', 'total_amount', 'status', 'period_start', 'period_end', 'paid_at']),
            // Décisions prises sur ce compte (validation, refus, suspension…) et par qui.
            'history' => AuditLog::with('user:id,first_name,last_name')
                ->where(fn ($q) => $q->where(fn ($w) => $w->where('subject_type', $deliverer->getMorphClass())->where('subject_id', $deliverer->id))
                    ->orWhere(fn ($w) => $w->where('subject_type', $user->getMorphClass())->where('subject_id', $user->id)))
                ->latest('created_at')->limit(15)->get()
                ->map(fn (AuditLog $l) => ['action' => $l->action, 'meta' => $l->meta, 'by' => $l->user ? trim($l->user->first_name.' '.$l->user->last_name) : null, 'at' => $l->created_at]),
        ];
    }
}
