<?php

namespace App\Notifications;

use App\Models\Payout;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/** Le livreur est prévenu qu'un versement vient d'être payé sur son Mobile Money. */
class PayoutSent extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Payout $payout) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $amount = number_format((float) $this->payout->total_amount, 0, ',', ' ');

        return [
            'title' => 'Versement effectué',
            'body' => "{$amount} FCFA viennent d'être envoyés sur votre Mobile Money.",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => "payout-{$this->payout->id}",
        ];
    }
}
