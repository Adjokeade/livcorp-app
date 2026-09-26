<?php

namespace App\Notifications;

use App\Models\Deliverer;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Le dossier du livreur est refusé : il doit savoir pourquoi et pouvoir renvoyer ses pièces.
 */
class DelivererAccountRejected extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Deliverer $deliverer) {}

    public function via($notifiable): array
    {
        return ['mail', WebPushChannel::class];
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Votre dossier livreur LIV corp')
            ->greeting("Bonjour {$notifiable->first_name},")
            ->line('Nous n\'avons pas pu valider votre dossier pour le moment.')
            ->line("Motif : {$this->deliverer->rejection_reason}")
            ->line('Vous pouvez renvoyer vos pièces depuis votre tableau de bord : notre équipe les examinera à nouveau.')
            ->action('Ouvrir mon tableau de bord', config('app.frontend_url').'/deliverer/tableau-de-bord');
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Dossier livreur refusé',
            'body' => "Motif : {$this->deliverer->rejection_reason}. Vous pouvez renvoyer vos pièces.",
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => 'deliverer-account',
        ];
    }
}
