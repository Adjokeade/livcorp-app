<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payout extends Model
{
    use HasFactory;

    protected $fillable = [
        'beneficiary_id', 'beneficiary_type', 'total_amount', 'period_type', 'period_start', 'period_end',
        'status', 'mobile_money_number', 'fedapay_payout_id', 'fedapay_payload', 'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'period_start' => 'date',
            'period_end' => 'date',
            'fedapay_payload' => 'array',
            'paid_at' => 'datetime',
        ];
    }

    public function beneficiary(): BelongsTo { return $this->belongsTo(User::class, 'beneficiary_id'); }
    public function commissions(): HasMany { return $this->hasMany(Commission::class); }
}
