<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Merchant extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'shop_name', 'shop_address', 'shop_lat', 'shop_lng', 'shop_phone',
        'opening_hours', 'verification_status', 'rejection_reason', 'verified_at', 'verified_by',
    ];

    protected function casts(): array
    {
        return [
            'shop_lat' => 'decimal:7',
            'shop_lng' => 'decimal:7',
            'opening_hours' => 'array',
            'verified_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function isVerified(): bool
    {
        return $this->verification_status === 'approved';
    }
}
