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
            // Un livreur doit avoir une photo de profil pour accéder à ses courses.
            'avatar_path' => $role === 'livreur' ? 'avatars/test.jpg' : null,
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
            // Le paiement se fait à la création : une livraison publiée (ou plus avancée) est toujours payée.
            'payment_status' => $status === Order::STATUS_ANNULEE ? 'en_attente' : 'paye',
            'payment_method' => $status === Order::STATUS_ANNULEE ? null : $method,
        ]);
    }

    /** Mène une livraison jusqu'à « livrée » comme en vrai : photo de réception (remise), puis confirmation de l'expéditeur. */
    protected function completeDelivery(Order $order): Order
    {
        $service = app(\App\Services\OrderStatusService::class);

        if ($order->status === Order::STATUS_EN_COURS_LIVRAISON) {
            $order = $service->transitionTo($order, Order::STATUS_REMISE);
        }

        return $service->transitionTo($order, Order::STATUS_LIVREE);
    }

    /** Clés KKiaPay de test : sans elles, le paiement en ligne (donc la création d'une livraison) est indisponible. */
    protected function configureKkiapay(): void
    {
        config(['services.kkiapay' => ['sandbox' => true, 'public_key' => 'pk', 'private_key' => 'sk', 'secret' => 'ss', 'webhook_secret' => 'hash-secret']]);
    }
}
