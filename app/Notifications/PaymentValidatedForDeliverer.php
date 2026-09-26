<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Le client vient de valider le paiement : le livreur peut finaliser la livraison.
 */
class PaymentValidatedForDeliverer extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $amount = number_format((float) $this->order->price, 0, ',', ' ');
        $how = $this->order->payment_method === 'especes' ? 'en espèces' : 'en ligne';

        return [
            'title' => 'Paiement validé',
            'body' => "{$amount} FCFA réglés {$how} pour la course #{$this->order->reference}. Vous pouvez finaliser la livraison.",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "payment-{$this->order->id}",
        ];
    }
}
