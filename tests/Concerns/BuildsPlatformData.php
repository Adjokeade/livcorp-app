<?php

namespace Tests\Concerns;

use App\Models\Deliverer;
use App\Models\Order;
use App\Models\User;

/**
 * Fabriques de données de test communes (utilisateurs, livreurs, commandes).
 */
trait BuildsPlatformData
{
    private int $seq = 0;

    protected function makeUser(string $role): User
    {
        $this->seq++;
        $user = User::create([
            'role' => $role,
            'first_name' => ucfirst($role).$this->seq,
            'last_name' => 'Test',
            'email' => "{$role}{$this->seq}@test.bj",
            'phone' => '+2290100'.str_pad((string) $this->seq, 4, '0', STR_PAD_LEFT),
            'password' => 'Passw0rdX',
            'is_active' => true,
        ]);
        $user->forceFill(['email_verified_at' => now()])->save();

        return $user;
    }

    protected function makeDeliverer(string $status = 'approved'): Deliverer
    {
        return Deliverer::create([
            'user_id' => $this->makeUser('livreur')->id,
            'verification_status' => $status,
            'vehicle_type' => 'moto',
        ]);
    }

    protected function makeOrder(User $client, ?Deliverer $deliverer, string $status, float $price = 2000, string $method = 'en_ligne', array $overrides = []): Order
    {
        $this->seq++;

        return Order::create($overrides + [
            'reference' => 'LIV-TEST-'.$this->seq,
            'type' => 'colis',
            'client_id' => $client->id,
            'deliverer_id' => $deliverer?->id,
            'pickup_address' => 'A', 'pickup_lat' => 6.37, 'pickup_lng' => 2.39,
            'dropoff_address' => 'B', 'dropoff_lat' => 6.40, 'dropoff_lng' => 2.42,
            'price' => $price,
            'status' => $status,
            // Le paiement se valide à la réception : toute course livrée l'est déjà.
            'payment_status' => in_array($status, [Order::STATUS_EN_COURS_LIVRAISON, Order::STATUS_LIVREE], true) ? 'paye' : 'en_attente',
            'payment_method' => in_array($status, [Order::STATUS_EN_COURS_LIVRAISON, Order::STATUS_LIVREE], true) ? $method : null,
        ]);
    }
}
