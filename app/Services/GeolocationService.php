<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Service de géolocalisation : calcul de distance et estimation tarifaire.
 * Fournisseur configurable (Google Maps ou OpenStreetMap) via services.maps.provider.
 */
class GeolocationService
{
    /**
     * Distance à vol d'oiseau (formule de Haversine), en kilomètres.
     * Suffisant pour l'estimation tarifaire ; un appel à l'API cartographique
     * peut affiner avec la distance routière réelle si besoin.
     */
    public function distanceInKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadiusKm = 6371;

        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return round($earthRadiusKm * $c, 2);
    }

    /**
     * Itinéraire routier entre deux points : distance réelle sur route, durée et tracé.
     * La distance à vol d'oiseau sous-estime fortement le trajet (~30 à 40 % en ville) et
     * fausse donc le prix ; on interroge OSRM, avec un repli explicite si le service ne répond pas.
     *
     * @return array{distance_km: float, duration_min: int, geometry: array<int, array{0: float, 1: float}>, source: 'route'|'approx'}
     */
    public function route(float $lat1, float $lng1, float $lat2, float $lng2): array
    {
        $key = sprintf('route:%.5f,%.5f:%.5f,%.5f', $lat1, $lng1, $lat2, $lng2);

        // Un repli n'est mis en cache que très peu de temps : le service peut revenir vite.
        $cached = Cache::get($key);
        if ($cached) {
            return $cached;
        }

        try {
            $response = Http::timeout(6)->acceptJson()->get(
                rtrim((string) config('services.maps.osrm_url'), '/')."/route/v1/driving/{$lng1},{$lat1};{$lng2},{$lat2}",
                ['overview' => 'simplified', 'geometries' => 'geojson'],
            );
            $route = $response->json('routes.0');

            if ($response->successful() && $response->json('code') === 'Ok' && $route) {
                $result = [
                    'distance_km' => round($route['distance'] / 1000, 2),
                    'duration_min' => max(1, (int) round($route['duration'] / 60)),
                    // GeoJSON donne [lng, lat] ; Leaflet attend [lat, lng].
                    'geometry' => array_map(fn ($c) => [round($c[1], 6), round($c[0], 6)], $route['geometry']['coordinates']),
                    'source' => 'route',
                ];
                Cache::put($key, $result, now()->addDay());

                return $result;
            }
        } catch (Throwable $e) {
            Log::warning('OSRM indisponible, distance approchée utilisée.', ['error' => $e->getMessage()]);
        }

        // Repli : vol d'oiseau majoré d'un coefficient de détour urbain, vitesse moyenne 25 km/h.
        $distance = round($this->distanceInKm($lat1, $lng1, $lat2, $lng2) * 1.35, 2);
        $fallback = [
            'distance_km' => $distance,
            'duration_min' => max(1, (int) round($distance / 25 * 60)),
            'geometry' => [[$lat1, $lng1], [$lat2, $lng2]],
            'source' => 'approx',
        ];
        Cache::put($key, $fallback, now()->addMinutes(2));

        return $fallback;
    }

    /**
     * Estimation du tarif d'une commande.
     * Barème simple et transparent, à ajuster selon la politique tarifaire de LIV corp.
     */
    public function estimatePrice(float $distanceKm, string $urgency = 'standard', ?string $packageType = null): float
    {
        $baseFare = 500; // FCFA
        $perKm = 150;    // FCFA / km

        $price = $baseFare + ($distanceKm * $perKm);

        if ($urgency === 'express') {
            $price *= 1.4;
        }

        return round($price, -1); // arrondi à la dizaine la plus proche
    }
}
