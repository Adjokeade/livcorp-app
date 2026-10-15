<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/** Le livreur confirme avoir encaissé les espèces au retrait du colis : l'expéditeur en est informé. */
class CashCollected extends Notification implements ShouldQueue
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
        $name = $this->order->deliverer?->user?->first_name ?? 'Votre livreur';

        return [
            'title' => 'Espèces encaissées',
            'body' => "{$name} confirme avoir reçu {$amount} FCFA en espèces pour #{$this->order->reference}. Ce n'est pas votre cas ? Contactez-nous.",
            'url' => config('app.frontend_url')."/client/suivi/{$this->order->id}",
            'tag' => "cash-{$this->order->id}",
        ];
    }
}
