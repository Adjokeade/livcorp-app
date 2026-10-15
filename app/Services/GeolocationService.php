<?php

namespace App\Services;

use App\Models\Setting;
use App\Models\User;
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
            // Une nouvelle tentative rapide : le service public d'itinéraires coupe parfois une requête isolée.
            $response = Http::timeout(6)->retry(2, 250, throw: false)->acceptJson()->get(
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
    public function estimatePrice(float $distanceKm, string $urgency = 'standard', ?string $packageType = null, ?array $tariff = null): float
    {
        $tariff ??= static::tariff();

        $price = $tariff['base_fare'] + ($distanceKm * $tariff['per_km']);

        if ($urgency === 'express') {
            $price *= $tariff['express_multiplier'];
        }

        return round($price, -1); // arrondi à la dizaine la plus proche
    }

    /**
     * Itinéraire à travers plusieurs étapes dans l'ordre donné (position du livreur, puis ses arrêts) : une
     * distance et une durée routières pour chaque tronçon, plus le total et le tracé. Un seul appel à OSRM.
     * Si le service ne répond pas, chaque tronçon est approché à vol d'oiseau (coefficient de détour urbain).
     *
     * @param  array<int, array{0: float, 1: float}>  $points  [lat, lng], au moins deux
     * @return array{legs: array<int, array{distance_km: float, duration_min: int}>, distance_km: float, duration_min: int, geometry: array, source: 'route'|'approx'}
     */
    public function routeVia(array $points): array
    {
        $key = 'route-via:'.md5(json_encode(array_map(fn ($p) => [round($p[0], 4), round($p[1], 4)], $points)));

        if ($cached = Cache::get($key)) {
            return $cached;
        }

        try {
            $coords = collect($points)->map(fn ($p) => $p[1].','.$p[0])->implode(';');
            $response = Http::timeout(8)->retry(2, 250, throw: false)->acceptJson()->get(
                rtrim((string) config('services.maps.osrm_url'), '/')."/route/v1/driving/{$coords}",
                ['overview' => 'simplified', 'geometries' => 'geojson', 'steps' => 'false'],
            );
            $route = $response->json('routes.0');

            if ($response->successful() && $response->json('code') === 'Ok' && $route && count($route['legs'] ?? []) === count($points) - 1) {
                $result = [
                    'legs' => array_map(fn ($leg) => [
                        'distance_km' => round($leg['distance'] / 1000, 2),
                        'duration_min' => max(0, (int) round($leg['duration'] / 60)),
                    ], $route['legs']),
                    'distance_km' => round($route['distance'] / 1000, 2),
                    'duration_min' => max(1, (int) round($route['duration'] / 60)),
                    'geometry' => array_map(fn ($c) => [round($c[1], 6), round($c[0], 6)], $route['geometry']['coordinates']),
                    'source' => 'route',
                ];
                Cache::put($key, $result, now()->addSeconds(20));

                return $result;
            }
        } catch (Throwable $e) {
            Log::warning('OSRM indisponible, tronçons approchés.', ['error' => $e->getMessage()]);
        }

        $legs = [];
        for ($i = 1; $i < count($points); $i++) {
            $km = round($this->distanceInKm($points[$i - 1][0], $points[$i - 1][1], $points[$i][0], $points[$i][1]) * 1.35, 2);
            $legs[] = ['distance_km' => $km, 'duration_min' => (int) round($km / 25 * 60)];
        }
        $fallback = [
            'legs' => $legs,
            'distance_km' => round(array_sum(array_column($legs, 'distance_km')), 2),
            'duration_min' => array_sum(array_column($legs, 'duration_min')),
            'geometry' => $points,
            'source' => 'approx',
        ];
        Cache::put($key, $fallback, now()->addSeconds(20));

        return $fallback;
    }

    /** Valeurs par défaut du barème, utilisées tant que l'administrateur n'a rien modifié. */
    public const DEFAULT_TARIFF = ['base_fare' => 500, 'per_km' => 150, 'express_multiplier' => 1.4];

    /**
     * Barème applicable à un expéditeur : celui de la plateforme, ou le tarif négocié de son entreprise
     * (porté par le compte propriétaire, donc commun à toute l'équipe).
     */
    public static function tariffFor(?User $user): array
    {
        $standard = static::tariff();

        if ($user && $user->role === 'client' && $user->account_type === 'entreprise') {
            $custom = $user->ownerAccount()->custom_tariff;

            if ($custom) {
                return array_replace($standard, $custom);
            }
        }

        return $standard;
    }

    /**
     * Prix imposé d'une livraison : fonction de la distance (et de l'urgence), jamais saisi par le client.
     * Jamais en dessous du prix minimum de la plateforme.
     */
    public function priceFor(?User $user, float $distanceKm, string $urgency = 'standard'): int
    {
        return (int) max(
            (int) config('services.orders.min_price'),
            $this->estimatePrice($distanceKm, $urgency, null, static::tariffFor($user)),
        );
    }

    /** Barème en vigueur : base (FCFA), prix par km (FCFA) et majoration express. Modifiable par l'administrateur. */
    public static function tariff(): array
    {
        return Setting::read('tariff', self::DEFAULT_TARIFF);
    }
}
