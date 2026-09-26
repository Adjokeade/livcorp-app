<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Deliverer extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'verification_status', 'rejection_reason', 'vehicle_type', 'vehicle_plate',
        'emergency_phone', 'is_available', 'current_lat', 'current_lng', 'location_updated_at',
        'average_rating', 'total_deliveries', 'wallet_balance', 'mobile_money_number',
        'verified_at', 'verified_by',
    ];

    protected function casts(): array
    {
        return [
            'is_available' => 'boolean',
            'current_lat' => 'decimal:7',
            'current_lng' => 'decimal:7',
            'location_updated_at' => 'datetime',
            'average_rating' => 'decimal:2',
            'wallet_balance' => 'decimal:2',
            'verified_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function trackingPoints(): HasMany
    {
        return $this->hasMany(TrackingPoint::class);
    }

    /**
     * Recalcule note moyenne, nombre de livraisons et solde à recevoir depuis les
     * données sources (avis, commandes livrées, commissions). Idempotent : les
     * colonnes ne sont qu'un cache, on peut l'appeler autant de fois que voulu.
     *
     * Solde = net des commissions pas encore versées ("due", ou incluses dans un
     * versement en cours), donc ce que LIV corp doit encore au livreur.
     */
    public function refreshStats(): void
    {
        $rating = $this->reviews()->avg('rating');

        $this->update([
            'average_rating' => $rating === null ? 0 : round((float) $rating, 2),
            'total_deliveries' => $this->orders()->where('status', Order::STATUS_LIVREE)->count(),
            'wallet_balance' => Commission::where('beneficiary_id', $this->user_id)
                ->where('beneficiary_type', 'livreur')
                ->whereIn('status', ['due', 'included_in_payout'])
                ->sum('net_amount'),
        ]);
    }

    public function isVerified(): bool
    {
        return $this->verification_status === 'approved';
    }
}
