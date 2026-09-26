<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le client est de nouveau joignable : le livreur peut reprendre la remise.
 */
class DeliveryRetryRequested extends Notification implements ShouldQueue
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
            'title' => 'Le client est joignable',
            'body' => "Reprenez la livraison de la course #{$this->order->reference}.",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "order-{$this->order->id}",
        ];
    }
}
