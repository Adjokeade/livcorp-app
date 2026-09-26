<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Une course vient d'être publiée près d'un livreur disponible.
 */
class NewOrderAvailable extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        // "Marché Dantokpa, Boulevard…" -> "Marché Dantokpa" : l'essentiel tient sur un écran verrouillé.
        $short = fn (string $address) => trim(explode(',', $address)[0]);
        $price = number_format((float) $this->order->price, 0, ',', ' ');
        $km = number_format((float) $this->order->distance_km, 1, ',', ' ');

        return [
            'title' => 'Nouvelle course près de vous',
            'body' => "{$short($this->order->pickup_address)} → {$short($this->order->dropoff_address)} · {$km} km · {$price} FCFA",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "new-order-{$this->order->id}",
        ];
    }
}
