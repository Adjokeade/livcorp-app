<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TrackingPoint extends Model
{
    public $timestamps = false;
    protected $fillable = ['order_id', 'deliverer_id', 'lat', 'lng', 'recorded_at'];

    protected function casts(): array
    {
        return ['lat' => 'decimal:7', 'lng' => 'decimal:7', 'recorded_at' => 'datetime'];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function deliverer(): BelongsTo { return $this->belongsTo(Deliverer::class); }
}
