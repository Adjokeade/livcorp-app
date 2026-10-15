<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Deliverer;
use App\Models\Order;
use Illuminate\Http\Request;

/**
 * Livreurs favoris de l'expéditeur (partagés par toute l'équipe d'une entreprise). On ne peut mettre
 * en favori qu'un livreur avec lequel on a effectivement travaillé : celui d'une de ses livraisons.
 */
class FavoriteDelivererController extends Controller
{
    private const MAX_FAVORITES = 30;

    public function index(Request $request)
    {
        return $request->user()->ownerAccount()->favoriteDeliverers()
            ->with('user:id,first_name')
            ->get()
            ->map(fn (Deliverer $d) => [
                'id' => $d->id,
                'first_name' => $d->user->first_name,
                'average_rating' => $d->average_rating,
                'total_deliveries' => $d->total_deliveries,
                'vehicle_type' => $d->vehicle_type,
                'is_available' => (bool) $d->is_available,
            ]);
    }

    public function store(Request $request, Order $order)
    {
        $this->authorize('view', $order);
        abort_if(! $order->deliverer_id, 422, 'Cette livraison n\'a pas encore de livreur.');

        $owner = $request->user()->ownerAccount();
        abort_if(
            ! $owner->favoriteDeliverers()->whereKey($order->deliverer_id)->exists()
                && $owner->favoriteDeliverers()->count() >= self::MAX_FAVORITES,
            422,
            'Vous avez atteint la limite de '.self::MAX_FAVORITES.' livreurs favoris.'
        );

        $owner->favoriteDeliverers()->syncWithoutDetaching([$order->deliverer_id]);

        return response()->json(['deliverer_id' => $order->deliverer_id], 201);
    }

    public function destroy(Request $request, Deliverer $deliverer)
    {
        $request->user()->ownerAccount()->favoriteDeliverers()->detach($deliverer->id);

        return response()->noContent();
    }
}
