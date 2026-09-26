<?php

namespace App\Notifications;

use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Pour les administrateurs : un livreur a déposé ses pièces, son compte attend une validation.
 */
class DelivererDocumentsReceived extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public User $deliverer) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Nouveau dossier livreur à valider',
            'body' => "{$this->deliverer->first_name} {$this->deliverer->last_name} a envoyé ses pièces justificatives.",
            'url' => config('app.frontend_url').'/admin',
            'tag' => 'deliverer-validation',
        ];
    }
}
