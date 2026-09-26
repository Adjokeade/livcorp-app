<?php

use Illuminate\Support\Facades\Broadcast;
use App\Models\Order;

/*
|--------------------------------------------------------------------------
| Autorisation des canaux de diffusion privés (Reverb)
|--------------------------------------------------------------------------
| Exigence sécurité : un utilisateur ne peut s'abonner qu'au canal de sa
| propre commande (client, livreur assigné, ou admin).
*/
Broadcast::channel('order.{orderId}', function ($user, int $orderId) {
    $order = Order::find($orderId);

    if (! $order) {
        return false;
    }

    if ($user->isAdmin() || $order->client_id === $user->id) {
        return true;
    }

    // Livreur assigné uniquement. Le test explicite sur null évite qu'un
    // utilisateur sans profil livreur ne matche une commande non assignée
    // (null === null).
    return $order->deliverer_id !== null
        && $order->deliverer_id === $user->deliverer?->id;
});
