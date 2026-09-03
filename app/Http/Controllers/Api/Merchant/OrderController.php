<?php

namespace App\Http\Controllers\Api\Merchant;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * Commandes de courses associées à la boutique du commerçant.
 * Cf. cahier des charges §3.2 : "Réception et gestion des commandes de courses
 * associées à la boutique".
 */
class OrderController extends Controller
{
    public function index(Request $request)
    {
        $merchant = $request->user()->merchant;

        abort_if(! $merchant, 404, 'Profil boutique introuvable.');

        return $merchant->orders()
            ->with(['client', 'deliverer.user'])
            ->latest()
            ->paginate(15);
    }

    public function stats(Request $request)
    {
        $merchant = $request->user()->merchant;

        abort_if(! $merchant, 404, 'Profil boutique introuvable.');

        return response()->json([
            'orders_total' => $merchant->orders()->count(),
            'orders_in_progress' => $merchant->orders()->whereIn('status', [
                'acceptee', 'colis_recupere', 'en_cours_livraison',
            ])->count(),
            'orders_delivered' => $merchant->orders()->where('status', 'livree')->count(),
            'revenue_total' => $merchant->orders()->where('payment_status', 'paye')->sum('price'),
        ]);
    }
}
