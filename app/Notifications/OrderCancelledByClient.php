<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le client a annulé sa commande : le livreur qui l'avait acceptée (ou qui avait fait une proposition de prix)
 * doit le savoir tout de suite, pour ne pas se déplacer pour rien.
 */
class OrderCancelledByClient extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order, public bool $wasAssigned) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Course annulée',
            'body' => $this->wasAssigned
                ? "Le client a annulé la course #{$this->order->reference} que vous aviez acceptée. Ne vous déplacez pas."
                : "Le client a annulé la course #{$this->order->reference} pour laquelle vous aviez fait une proposition.",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "order-cancelled-{$this->order->id}",
        ];
    }
}
