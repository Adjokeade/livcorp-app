<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** E-mail du lien de réinitialisation du mot de passe (valable 60 minutes, usage unique). */
class PasswordResetLink extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public string $token) {}

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $url = config('app.frontend_url').'/reinitialiser-mot-de-passe?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);
        $minutes = (int) config('auth.passwords.users.expire', 60);

        return (new MailMessage)
            ->subject('Réinitialisation de votre mot de passe LIV corp')
            ->greeting("Bonjour {$notifiable->first_name},")
            ->line('Vous avez demandé à choisir un nouveau mot de passe pour votre compte LIV corp.')
            ->action('Choisir un nouveau mot de passe', $url)
            ->line("Ce lien est valable {$minutes} minutes et ne peut servir qu'une fois.")
            ->line("Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail : votre mot de passe actuel reste inchangé.");
    }
}
