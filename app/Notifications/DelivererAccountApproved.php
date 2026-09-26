<?php

namespace App\Notifications;

use App\Models\Deliverer;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * E-mail transactionnel (via Brevo, configuré comme MAIL_MAILER=smtp dans .env)
 * envoyé au livreur dès que son compte est validé par l'administrateur.
 * Ton chaleureux, cf. exigence "plateforme hyper humaine".
 */
class DelivererAccountApproved extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Deliverer $deliverer) {}

    public function via($notifiable): array
    {
        return ['mail', WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Compte livreur activé !',
            'body' => 'Votre dossier est validé : passez en disponible pour recevoir des courses.',
            'url' => config('app.frontend_url').'/deliverer/tableau-de-bord',
            'tag' => 'deliverer-account',
        ];
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Votre compte livreur LIV corp est activé ! 🎉')
            ->greeting("Bienvenue chez LIV corp, {$notifiable->first_name} !")
            ->line('Bonne nouvelle : votre compte livreur vient d\'être validé par notre équipe.')
            ->line('Vous pouvez dès maintenant vous connecter, passer en disponible et commencer à accepter des courses.')
            ->action('Ouvrir mon tableau de bord', config('app.frontend_url').'/deliverer/tableau-de-bord')
            ->line('Merci de faire partie de l\'aventure LIV corp !');
    }
}
