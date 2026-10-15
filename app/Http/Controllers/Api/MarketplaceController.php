<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Deliverer;
use App\Models\Order;
use App\Services\GeolocationService;
use Illuminate\Http\Request;

/**
 * Page "Marché" : pouls de la plateforme en temps réel, ouverte à tout
 * utilisateur connecté (client ou livreur) — colis en attente d'un livreur,
 * et livreurs actuellement disponibles. Volontairement moins détaillée que
 * les endpoints métier (pas d'adresse exacte : un colis n'appartient pas à
 * la personne qui consulte cette page).
 */
class MarketplaceController extends Controller
{
    public function __construct(private readonly GeolocationService $geo) {}

    public function orders(Request $request)
    {
        $orders = Order::query()
            ->where('status', Order::STATUS_CREEE)
            ->whereNull('deliverer_id')
            // Les courses réservées aux livreurs favoris d'un client restent hors de la page publique.
            ->where(fn ($q) => $q->whereNull('priority_until')->orWhere('priority_until', '<=', now()))
            ->latest()
            ->get(['id', 'reference', 'type', 'urgency', 'price', 'distance_km', 'duration_min', 'package_type', 'pickup_address', 'dropoff_address', 'photo_path', 'created_at'])
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'reference' => $order->reference,
                'type' => $order->type,
                'urgency' => $order->urgency,
                'price' => $order->price,
                'distance_km' => $order->distance_km,
                'duration_min' => $order->duration_min,
                'package_type' => $order->package_type,
                // Zones seulement : ni rue, ni coordonnées, ni destinataire, ni consignes.
                'pickup_area' => Order::areaOf($order->pickup_address),
                'dropoff_area' => Order::areaOf($order->dropoff_address),
                'has_photo' => filled($order->photo_path),
                // La photo du colis est publique, comme l'annonce : l'URL est signée et expire au bout de quelques heures.
                'photo_url' => $order->photo_url,
                'created_at' => $order->created_at,
            ]);

        return response()->json(['data' => $orders]);
    }

    public function deliverers(Request $request)
    {
        $validated = $request->validate([
            'lat' => 'nullable|numeric|between:-90,90',
            'lng' => 'nullable|numeric|between:-180,180',
        ]);

        $deliverers = Deliverer::query()
            ->with('user:id,first_name')
            ->where('verification_status', 'approved')
            ->where('is_available', true)
            ->whereNotNull('current_lat')
            ->whereNotNull('current_lng')
            ->get()
            ->map(function (Deliverer $deliverer) use ($validated) {
                $distanceKm = isset($validated['lat'], $validated['lng'])
                    ? $this->geo->distanceInKm(
                        (float) $validated['lat'], (float) $validated['lng'],
                        (float) $deliverer->current_lat, (float) $deliverer->current_lng,
                    )
                    : null;

                return [
                    'id' => $deliverer->id,
                    'first_name' => $deliverer->user->first_name,
                    'vehicle_type' => $deliverer->vehicle_type,
                    'average_rating' => $deliverer->average_rating,
                    'total_deliveries' => $deliverer->total_deliveries,
                    'lat' => $deliverer->current_lat,
                    'lng' => $deliverer->current_lng,
                    'distance_km' => $distanceKm,
                ];
            });

        if (isset($validated['lat'], $validated['lng'])) {
            $deliverers = $deliverers->sortBy('distance_km')->values();
        }

        return response()->json(['data' => $deliverers]);
    }
}
