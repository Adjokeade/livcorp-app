<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le livreur signale son arrivée au retrait ou chez le destinataire.
 */
class DelivererArrived extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order, public string $point) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $name = $this->order->deliverer?->user?->first_name ?? 'Votre livreur';
        $atPickup = $this->point === 'pickup';

        return [
            'title' => $atPickup ? "{$name} est arrivé au point de retrait" : "{$name} est arrivé",
            'body' => $atPickup
                ? 'Il récupère votre colis.'
                : 'Donnez-lui votre code de remise et validez le paiement.',
            'url' => config('app.frontend_url')."/client/suivi/{$this->order->id}",
            'tag' => "order-{$this->order->id}",
        ];
    }
}
