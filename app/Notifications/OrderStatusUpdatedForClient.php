<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Notification client à chaque étape clé de sa commande (e-mail + notification push).
 * Le message est personnalisé avec le prénom du livreur pour renforcer
 * le ton "hyper humain" attendu par le cahier des charges.
 */
class OrderStatusUpdatedForClient extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return ['mail', WebPushChannel::class];
    }

    private function message(): string
    {
        $delivererName = $this->order->deliverer?->user?->first_name ?? 'votre livreur';

        return match ($this->order->status) {
            'acceptee' => "{$delivererName} a accepté votre commande et se prépare à venir récupérer votre colis.",
            'colis_recupere' => "{$delivererName} vient de récupérer votre colis, direction la livraison !",
            'en_cours_livraison' => "{$delivererName} est en route vers vous. À la remise du colis, validez le paiement dans l'application.",
            'livree' => 'Votre commande a été livrée avec succès. Merci de votre confiance ! Un avis sur votre livreur ?',
            'annulee' => 'Votre commande a bien été annulée.',
            'creee' => "Votre livreur ne peut plus assurer la course : nous la proposons à d'autres livreurs.",
            default => 'Le statut de votre commande a été mis à jour.',
        };
    }

    private function url(): string
    {
        return config('app.frontend_url')."/client/suivi/{$this->order->id}";
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Commande {$this->order->reference} — mise à jour")
            ->line($this->message())
            ->action('Suivre ma commande', $this->url());
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => match ($this->order->status) {
                'acceptee' => 'Un livreur a accepté votre commande',
                'colis_recupere' => 'Votre colis est récupéré',
                'en_cours_livraison' => 'Votre livreur arrive',
                'livree' => 'Colis livré',
                'annulee' => 'Commande annulée',
                'creee' => 'Nouveau livreur en recherche',
                default => "Commande {$this->order->reference}",
            },
            'body' => $this->message(),
            'url' => $this->url(),
            'tag' => "order-{$this->order->id}",
        ];
    }
}
