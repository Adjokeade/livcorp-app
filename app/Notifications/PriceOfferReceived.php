<?php

namespace App\Notifications;

use App\Models\PriceOffer;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Un livreur propose un autre prix (ou demande une révision sur sa course) : le client doit répondre.
 */
class PriceOfferReceived extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public PriceOffer $offer, public bool $revision = false) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $name = $this->offer->deliverer?->user?->first_name ?? 'Un livreur';
        $amount = number_format((float) $this->offer->amount, 0, ',', ' ');

        return [
            'title' => $this->revision ? "{$name} demande un nouveau prix : {$amount} FCFA" : "{$name} propose {$amount} FCFA",
            'body' => $this->offer->message ?: 'Ouvrez la commande pour accepter ou refuser sa proposition.',
            'url' => config('app.frontend_url')."/client/suivi/{$this->offer->order_id}",
            'tag' => "offer-{$this->offer->order_id}",
        ];
    }
}
