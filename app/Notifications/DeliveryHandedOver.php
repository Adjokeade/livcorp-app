<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Le livreur a remis le colis et envoyé la photo de réception : l'expéditeur est invité à confirmer. */
class DeliveryHandedOver extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return ['mail', WebPushChannel::class];
    }

    private function url(): string
    {
        return config('app.frontend_url')."/client/suivi/{$this->order->id}";
    }

    private function hours(): int
    {
        return (int) config('services.orders.auto_confirm_hours');
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Colis remis : confirmez la réception ({$this->order->reference})")
            ->line("Votre livreur a remis le colis {$this->order->reference} et envoyé la photo de réception.")
            ->line("Regardez la photo puis confirmez la réception dans l'application. Sans réponse de votre part sous {$this->hours()} h, elle sera confirmée automatiquement.")
            ->action('Confirmer la réception', $this->url());
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Colis remis : confirmez la réception',
            'body' => "Votre livreur a envoyé la photo de réception de #{$this->order->reference}. Confirmez dans l'application.",
            'url' => $this->url(),
            'tag' => "handed-over-{$this->order->id}",
        ];
    }
}
