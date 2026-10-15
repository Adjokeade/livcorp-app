<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/** La réception est confirmée : l'argent bloqué devient un solde pour le livreur. */
class DeliveryConfirmed extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order, public bool $automatic = false) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $earned = number_format((float) $this->order->deliverer_payout, 0, ',', ' ');

        return [
            'title' => 'Réception confirmée',
            'body' => "{$earned} FCFA ajoutés à votre solde pour la course #{$this->order->reference}"
                .($this->automatic ? ' (confirmation automatique).' : '.'),
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "confirmed-{$this->order->id}",
        ];
    }
}
