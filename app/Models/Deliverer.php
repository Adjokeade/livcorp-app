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
        'is_available', 'current_lat', 'current_lng', 'location_updated_at',
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

    public function isVerified(): bool
    {
        return $this->verification_status === 'approved';
    }
}
