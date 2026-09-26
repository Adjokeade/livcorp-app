<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le livreur demande au client de retrouver son code de remise (sans jamais l'écrire dans la notification).
 */
class DeliveryCodeReminder extends Notification implements ShouldQueue
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
            'title' => 'Votre code de remise',
            'body' => "{$name} attend votre code pour vous remettre le colis. Ouvrez la commande pour le voir.",
            'url' => config('app.frontend_url')."/client/suivi/{$this->order->id}",
            'tag' => "order-{$this->order->id}",
        ];
    }
}
