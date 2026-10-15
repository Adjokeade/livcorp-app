<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Carnet de destinataires d'un expéditeur : adresse toujours localisée. */
class Recipient extends Model
{
    protected $fillable = ['user_id', 'name', 'phone', 'address', 'lat', 'lng', 'details'];

    protected function casts(): array
    {
        return ['lat' => 'float', 'lng' => 'float'];
    }
}
