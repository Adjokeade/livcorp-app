<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use App\Services\RoutePlanService;
use Illuminate\Http\Request;

/** Itinéraire du livreur : ses arrêts dans l'ordre, avec distance et durée jusqu'à chacun depuis sa position. */
class RoutePlanController extends Controller
{
    public function __construct(private readonly RoutePlanService $plans) {}

    public function show(Request $request)
    {
        $validated = $request->validate([
            'lat' => 'nullable|numeric|between:-90,90',
            'lng' => 'nullable|numeric|between:-180,180',
        ]);

        $deliverer = $request->user()->deliverer;

        // Position de l'appareil si elle est fournie, sinon la dernière position connue du livreur.
        $lat = $validated['lat'] ?? $deliverer->current_lat;
        $lng = $validated['lng'] ?? $deliverer->current_lng;

        if ($lat === null || $lng === null) {
            return response()->json(['message' => 'Position inconnue : activez la localisation.'], 422);
        }

        return response()->json($this->plans->plan($deliverer, (float) $lat, (float) $lng));
    }
}
