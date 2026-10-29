<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Offre de prestation : un client cherche un professionnel (plombier, coiffeuse…) et un prestataire la prend. */
class ServiceRequest extends Model
{
    protected $fillable = [
        'client_id', 'provider_id', 'conciergerie_id', 'profession', 'title', 'description', 'city', 'address', 'budget', 'status', 'taken_at',
    ];

    protected function casts(): array
    {
        return ['taken_at' => 'datetime', 'budget' => 'integer'];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    public function conciergerie(): BelongsTo
    {
        return $this->belongsTo(User::class, 'conciergerie_id');
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ServiceProvider::class, 'provider_id');
    }

    /** Forme publique d'une offre : les coordonnées du client ne sortent qu'une fois l'offre prise ($withContact). */
    public function present(bool $withContact): array
    {
        return [
            'id' => $this->id,
            'profession' => $this->profession,
            'title' => $this->title,
            'description' => $this->description,
            'city' => $this->city,
            'address' => $withContact ? $this->address : null,
            'budget' => $this->budget,
            'status' => $this->status,
            'created_at' => $this->created_at,
            'taken_at' => $this->taken_at,
            'client_name' => $withContact ? trim($this->client->first_name.' '.$this->client->last_name) : $this->client->first_name,
            'client_phone' => $withContact ? $this->client->phone : null,
        ];
    }
}
