<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le livreur n'arrive pas à joindre le destinataire : le client doit réagir pour que la livraison continue.
 */
class RecipientUnreachable extends Notification implements ShouldQueue
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
            'title' => 'Livraison en attente',
            'body' => "{$name} n'arrive pas à joindre le destinataire. Confirmez que vous êtes joignable pour relancer la livraison.",
            'url' => config('app.frontend_url')."/client/suivi/{$this->order->id}",
            'tag' => "order-{$this->order->id}",
        ];
    }
}
