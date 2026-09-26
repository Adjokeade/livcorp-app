<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * Bascule disponible/indisponible du livreur (cf. cahier des charges
 * "Parcours du livreur", étape 4). Quand il passe disponible, sa position
 * est enregistrée pour apparaître sur la carte des expéditeurs.
 */
class AvailabilityController extends Controller
{
    public function update(Request $request)
    {
        $validated = $request->validate([
            'is_available' => 'required|boolean',
            'lat' => 'required_if:is_available,true|numeric|between:-90,90',
            'lng' => 'required_if:is_available,true|numeric|between:-180,180',
        ]);

        $deliverer = $request->user()->deliverer;

        $deliverer->update([
            'is_available' => $validated['is_available'],
            ...(isset($validated['lat'], $validated['lng']) ? [
                'current_lat' => $validated['lat'],
                'current_lng' => $validated['lng'],
                'location_updated_at' => now(),
            ] : []),
        ]);

        return $deliverer->fresh();
    }
}
