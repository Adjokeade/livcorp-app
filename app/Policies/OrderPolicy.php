<?php

namespace App\Policies;

use App\Models\Order;
use App\Models\User;

/**
 * Autorisation fine sur les commandes : garantit qu'un client ne peut voir/agir
 * que sur SES commandes, qu'un livreur ne peut agir que sur les commandes qui
 * lui sont assignées. Complète les middleware de rôle (défense en profondeur).
 */
class OrderPolicy
{
    public function view(User $user, Order $order): bool
    {
        return match ($user->role) {
            'client' => $order->client_id === $user->id,
            'livreur' => $order->deliverer_id === $user->deliverer?->id,
            'commercant' => $order->merchant_id === $user->merchant?->id,
            'admin' => true,
            default => false,
        };
    }

    public function accept(User $user, Order $order): bool
    {
        return $user->isLivreur()
            && $user->deliverer?->isVerified()
            && is_null($order->deliverer_id);
    }

    public function updateStatus(User $user, Order $order): bool
    {
        return $user->isLivreur() && $order->deliverer_id === $user->deliverer?->id;
    }

    public function track(User $user, Order $order): bool
    {
        return $order->client_id === $user->id || $user->isAdmin();
    }
}
