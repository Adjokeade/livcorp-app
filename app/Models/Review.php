<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    use HasFactory;

    protected $fillable = ['order_id', 'client_id', 'deliverer_id', 'rating', 'comment'];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function client(): BelongsTo { return $this->belongsTo(User::class, 'client_id'); }
    public function deliverer(): BelongsTo { return $this->belongsTo(Deliverer::class); }
}
