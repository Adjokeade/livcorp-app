<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Désistement d'un livreur sur une course acceptée. Sert à ne plus la lui proposer et à suivre sa fiabilité.
 */
class OrderRelease extends Model
{
    public $timestamps = false;

    protected $fillable = ['order_id', 'deliverer_id', 'reason', 'note'];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function deliverer(): BelongsTo { return $this->belongsTo(Deliverer::class); }
}
