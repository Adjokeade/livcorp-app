<?php

namespace App\Services;

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
