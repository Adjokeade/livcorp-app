<?php

namespace App\Notifications;

use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/** Pour la conciergerie : l'administration a validé ou refusé son compte. */
class ConciergerieDecision extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public User $conciergerie) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $approved = $this->conciergerie->conciergerie_status === 'approved';

        return [
            'title' => $approved ? 'Conciergerie validée !' : 'Conciergerie refusée',
            'body' => $approved ? 'Les missions de conciergerie sont disponibles.' : ($this->conciergerie->conciergerie_rejection_reason ?: 'Consultez votre espace pour en savoir plus.'),
            'url' => config('app.frontend_url').'/conciergerie/missions',
            'tag' => 'conciergerie-account',
        ];
    }
}
