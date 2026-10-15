<?php

namespace App\Services;

use App\Models\Deliverer;
use App\Models\Order;

/**
 * Itinéraire d'un livreur qui porte plusieurs colis : dans quel ordre passer, et combien de kilomètres et de
 * minutes jusqu'à chaque arrêt à partir de SA position actuelle.
 *
 * Arrêts : le point de collecte des courses acceptées dont le colis n'est pas encore récupéré, et la destination de
 * chaque course (de toutes celles dont le colis est récupéré, et de celles qui le seront). Un colis n'est livré
 * qu'après avoir été récupéré. L'ordre est celui du plus proche voisin, puis chaque tronçon est mesuré sur route.
 */
class RoutePlanService
{
    private const MAX_ORDERS = 10;

    public function __construct(private readonly GeolocationService $geo) {}

    /**
     * @return array{stops: array<int, array<string, mixed>>, total_distance_km: float, total_duration_min: int, source: string|null}
     */
    public function plan(Deliverer $deliverer, float $lat, float $lng): array
    {
        $orders = $deliverer->orders()
            ->whereIn('status', [Order::STATUS_ACCEPTEE, Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON])
            ->oldest('accepted_at')
            ->limit(self::MAX_ORDERS)
            ->get();

        if ($orders->isEmpty()) {
            return ['stops' => [], 'total_distance_km' => 0.0, 'total_duration_min' => 0, 'source' => null];
        }

        // Arrêts disponibles : colis en main -> destination ; colis à récupérer -> collecte (la destination suivra).
        $candidates = [];
        foreach ($orders as $order) {
            $candidates[] = $order->status === Order::STATUS_ACCEPTEE
                ? $this->stop($order, 'pickup')
                : $this->stop($order, 'dropoff');
        }

        $ordered = [];
        $position = [$lat, $lng];
        while ($candidates) {
            usort($candidates, fn ($a, $b) => $this->geo->distanceInKm($position[0], $position[1], $a['lat'], $a['lng'])
                <=> $this->geo->distanceInKm($position[0], $position[1], $b['lat'], $b['lng']));

            $next = array_shift($candidates);
            $ordered[] = $next;
            $position = [$next['lat'], $next['lng']];

            if ($next['type'] === 'pickup') {
                $candidates[] = $this->stop($orders->firstWhere('id', $next['order_id']), 'dropoff');
            }
        }

        $route = $this->geo->routeVia(array_merge([[$lat, $lng]], array_map(fn ($s) => [$s['lat'], $s['lng']], $ordered)));

        $elapsed = 0;
        $distance = 0.0;
        foreach ($ordered as $i => &$stop) {
            $leg = $route['legs'][$i];
            $elapsed += $leg['duration_min'];
            $distance += $leg['distance_km'];
            $stop['leg_distance_km'] = $leg['distance_km'];
            $stop['leg_duration_min'] = $leg['duration_min'];
            // Distance et durée cumulées depuis la position du livreur jusqu'à cet arrêt.
            $stop['distance_km'] = round($distance, 2);
            $stop['eta_min'] = $elapsed;
            $stop['order'] = $i + 1;
        }
        unset($stop);

        return [
            'stops' => $ordered,
            'total_distance_km' => round($distance, 2),
            'total_duration_min' => $elapsed,
            'source' => $route['source'],
        ];
    }

    /** @return array<string, mixed> */
    private function stop(Order $order, string $type): array
    {
        return [
            'order_id' => $order->id,
            'reference' => $order->reference,
            'type' => $type,
            'address' => $order->{$type.'_address'},
            'details' => $order->{$type.'_details'},
            'lat' => (float) $order->{$type.'_lat'},
            'lng' => (float) $order->{$type.'_lng'},
        ];
    }
}
