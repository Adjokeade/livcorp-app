<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Plusieurs codes de remise erronés : la remise est bloquée quelques minutes, le client est prévenu.
 */
class DeliveryCodeLocked extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Plusieurs codes erronés',
            'body' => "Un code incorrect a été saisi plusieurs fois pour la commande #{$this->order->reference}. Ne communiquez votre code qu'au livreur, en main propre.",
            'url' => config('app.frontend_url')."/client/suivi/{$this->order->id}",
            'tag' => "order-{$this->order->id}",
        ];
    }
}
