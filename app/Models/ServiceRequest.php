<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Offre de prestation : un client cherche un professionnel (plombier, coiffeuse…) et un prestataire la prend. */
class ServiceRequest extends Model
{
    protected $fillable = [
        'client_id', 'provider_id', 'profession', 'title', 'description', 'city', 'address', 'budget', 'status', 'taken_at',
    ];

    protected function casts(): array
    {
        return ['taken_at' => 'datetime', 'budget' => 'integer'];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ServiceProvider::class, 'provider_id');
    }
}
