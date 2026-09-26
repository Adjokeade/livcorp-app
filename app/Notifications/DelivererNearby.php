<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le livreur est tout près du lieu de livraison : le client peut se préparer à recevoir le colis et à valider le paiement.
 */
class DelivererNearby extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $name = $this->order->deliverer?->user?->first_name ?? 'Votre livreur';

        return [
            'title' => "{$name} est tout près",
            'body' => 'Préparez-vous à recevoir votre colis. Vous validerez le paiement à la remise.',
            'url' => config('app.frontend_url')."/client/suivi/{$this->order->id}",
            'tag' => "order-{$this->order->id}",
        ];
    }
}
