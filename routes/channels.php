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

    return $order->client_id === $user->id
        || $order->deliverer_id === $user->deliverer?->id
        || $user->isAdmin();
});
