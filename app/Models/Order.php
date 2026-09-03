<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Order extends Model
{
    use HasFactory;

    // Cycle de vie officiel d'une commande (machine à états)
    public const STATUS_CREEE = 'creee';
    public const STATUS_ACCEPTEE = 'acceptee';
    public const STATUS_COLIS_RECUPERE = 'colis_recupere';
    public const STATUS_EN_COURS_LIVRAISON = 'en_cours_livraison';
    public const STATUS_LIVREE = 'livree';
    public const STATUS_ANNULEE = 'annulee';
    public const STATUS_LITIGE = 'litige';

    // Transitions autorisées : clé = statut actuel, valeur = statuts suivants possibles
    public const ALLOWED_TRANSITIONS = [
        self::STATUS_CREEE => [self::STATUS_ACCEPTEE, self::STATUS_ANNULEE],
        self::STATUS_ACCEPTEE => [self::STATUS_COLIS_RECUPERE, self::STATUS_ANNULEE],
        self::STATUS_COLIS_RECUPERE => [self::STATUS_EN_COURS_LIVRAISON, self::STATUS_LITIGE],
        self::STATUS_EN_COURS_LIVRAISON => [self::STATUS_LIVREE, self::STATUS_LITIGE],
        self::STATUS_LIVREE => [self::STATUS_LITIGE],
        self::STATUS_ANNULEE => [],
        self::STATUS_LITIGE => [self::STATUS_LIVREE, self::STATUS_ANNULEE],
    ];

    protected $fillable = [
        'reference', 'type', 'client_id', 'merchant_id', 'deliverer_id',
        'pickup_address', 'pickup_lat', 'pickup_lng',
        'dropoff_address', 'dropoff_lat', 'dropoff_lng',
        'package_type', 'instructions', 'urgency', 'distance_km',
        'price', 'commission_amount', 'deliverer_payout',
        'status', 'payment_status',
        'accepted_at', 'picked_up_at', 'delivered_at', 'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'pickup_lat' => 'decimal:7', 'pickup_lng' => 'decimal:7',
            'dropoff_lat' => 'decimal:7', 'dropoff_lng' => 'decimal:7',
            'distance_km' => 'decimal:2',
            'price' => 'decimal:2', 'commission_amount' => 'decimal:2', 'deliverer_payout' => 'decimal:2',
            'accepted_at' => 'datetime', 'picked_up_at' => 'datetime',
            'delivered_at' => 'datetime', 'cancelled_at' => 'datetime',
        ];
    }

    public function canTransitionTo(string $newStatus): bool
    {
        return in_array($newStatus, self::ALLOWED_TRANSITIONS[$this->status] ?? [], true);
    }

    // --- Relations ---
    public function client(): BelongsTo { return $this->belongsTo(User::class, 'client_id'); }
    public function merchant(): BelongsTo { return $this->belongsTo(Merchant::class); }
    public function deliverer(): BelongsTo { return $this->belongsTo(Deliverer::class); }
    public function statusHistory(): HasMany { return $this->hasMany(OrderStatusHistory::class); }
    public function trackingPoints(): HasMany { return $this->hasMany(TrackingPoint::class); }
    public function transaction(): HasOne { return $this->hasOne(Transaction::class); }
    public function review(): HasOne { return $this->hasOne(Review::class); }
    public function disputes(): HasMany { return $this->hasMany(Dispute::class); }
    public function commissions(): HasMany { return $this->hasMany(Commission::class); }
}
