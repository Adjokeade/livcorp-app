<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Notification client à chaque étape clé de sa commande.
 * Le message est personnalisé avec le prénom du livreur pour renforcer
 * le ton "hyper humain" attendu par le cahier des charges.
 */
class OrderStatusUpdatedForClient extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $delivererName = $this->order->deliverer?->user?->first_name ?? 'votre livreur';

        $message = match ($this->order->status) {
            'acceptee' => "{$delivererName} a accepté votre commande et se prépare à venir récupérer votre colis.",
            'colis_recupere' => "{$delivererName} vient de récupérer votre colis, direction la livraison !",
            'en_cours_livraison' => "{$delivererName} est en route vers vous. Suivez-le en direct sur la carte.",
            'livree' => 'Votre commande a été livrée avec succès. Merci de votre confiance !',
            default => 'Le statut de votre commande a été mis à jour.',
        };

        return (new MailMessage)
            ->subject("Commande {$this->order->reference} — mise à jour")
            ->line($message)
            ->action('Suivre ma commande', config('app.frontend_url')."/commandes/{$this->order->reference}");
    }
}
