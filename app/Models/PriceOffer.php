<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Contre-proposition de prix d'un livreur sur une commande. Le client l'accepte
 * (le prix de la commande change, et le livreur est assigné si la course était
 * encore libre) ou la refuse.
 */
class PriceOffer extends Model
{
    use HasFactory;

    protected $fillable = ['order_id', 'deliverer_id', 'amount', 'message', 'status'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function deliverer(): BelongsTo { return $this->belongsTo(Deliverer::class); }
}
