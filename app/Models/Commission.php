<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Commission extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id', 'beneficiary_id', 'beneficiary_type', 'rate', 'order_amount',
        'commission_amount', 'net_amount', 'status', 'payout_id',
    ];

    protected function casts(): array
    {
        return [
            'rate' => 'decimal:2',
            'order_amount' => 'decimal:2',
            'commission_amount' => 'decimal:2',
            'net_amount' => 'decimal:2',
        ];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function beneficiary(): BelongsTo { return $this->belongsTo(User::class, 'beneficiary_id'); }
    public function payout(): BelongsTo { return $this->belongsTo(Payout::class); }
}
