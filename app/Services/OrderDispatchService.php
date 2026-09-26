<?php

namespace App\Services;

use App\Models\Deliverer;
use App\Models\Order;
use App\Notifications\NewOrderAvailable;

/**
 * Prévient les livreurs disponibles qu'une course vient d'être publiée près d'eux.
 */
class OrderDispatchService
{
    public function __construct(private readonly GeolocationService $geo) {}

    public function notifyNearbyDeliverers(Order $order): int
    {
        $radiusKm = (float) config('services.webpush.notify_radius_km', 15);

        $deliverers = Deliverer::query()
            ->where('verification_status', 'approved')
            ->where('is_available', true)
            ->whereNotIn('id', $order->releases()->pluck('deliverer_id'))
            // Inutile de mettre une notification en file pour quelqu'un qui n'a aucun appareil abonné.
            ->whereHas('user.pushSubscriptions')
            ->with('user')
            ->get()
            // Position inconnue : on le prévient quand même plutôt que de l'écarter à tort.
            ->filter(fn (Deliverer $d) => $d->current_lat === null || $d->current_lng === null
                || $this->geo->distanceInKm((float) $order->pickup_lat, (float) $order->pickup_lng, (float) $d->current_lat, (float) $d->current_lng) <= $radiusKm);

        foreach ($deliverers as $deliverer) {
            rescue(fn () => $deliverer->user->notify(new NewOrderAvailable($order)));
        }

        return $deliverers->count();
    }
}
