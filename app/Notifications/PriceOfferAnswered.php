<?php

namespace App\Notifications;

use App\Models\PriceOffer;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Réponse du client à la proposition de prix d'un livreur.
 */
class PriceOfferAnswered extends Notification implements ShouldQueue
{
    use Queueable;

    /** @param 'accepted'|'declined' $answer */
    public function __construct(public PriceOffer $offer, public string $answer) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $amount = number_format((float) $this->offer->amount, 0, ',', ' ');
        $reference = $this->offer->order?->reference;
        $accepted = $this->answer === 'accepted';

        return [
            'title' => $accepted ? 'Proposition acceptée !' : 'Proposition refusée',
            'body' => $accepted
                ? "Le client accepte {$amount} FCFA pour la course #{$reference}. Elle est à vous."
                : "Votre proposition de {$amount} FCFA pour la course #{$reference} n'a pas été retenue.",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "offer-answer-{$this->offer->order_id}",
        ];
    }
}
