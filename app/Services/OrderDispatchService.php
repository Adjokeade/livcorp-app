<?php

namespace App\Services;

use App\Models\Deliverer;
use App\Models\Order;
use App\Notifications\NewOrderAvailable;
use Illuminate\Support\Facades\DB;

/**
 * Prévient les livreurs disponibles qu'une course vient d'être publiée près d'eux.
 */
class OrderDispatchService
{
    public function __construct(private readonly GeolocationService $geo) {}

    /**
     * @param 'all'|'favorites'|'others' $audience favorites : seulement les livreurs favoris du client ;
     *                                              others : tous les autres (ceux qui n'ont pas déjà été prévenus).
     */
    public function notifyNearbyDeliverers(Order $order, string $audience = 'all'): int
    {
        $favoriteIds = $order->priority_owner_id
            ? DB::table('favorite_deliverers')->where('user_id', $order->priority_owner_id)->pluck('deliverer_id')
            : collect();

        $radiusKm = (float) config('services.webpush.notify_radius_km', 15);

        $deliverers = Deliverer::query()
            ->where('verification_status', 'approved')
            ->where('is_available', true)
            ->whereNotIn('id', $order->releases()->pluck('deliverer_id'))
            ->when($audience === 'favorites', fn ($q) => $q->whereIn('id', $favoriteIds))
            ->when($audience === 'others', fn ($q) => $q->whereNotIn('id', $favoriteIds))
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
