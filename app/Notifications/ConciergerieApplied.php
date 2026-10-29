<?php

namespace App\Notifications;

use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/** Pour les administrateurs : une conciergerie vient de s'inscrire et attend sa validation. */
class ConciergerieApplied extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public User $conciergerie) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Nouvelle conciergerie à valider',
            'body' => $this->conciergerie->company_name ?: $this->conciergerie->full_name,
            'url' => config('app.frontend_url').'/admin/prestataires',
            'tag' => 'conciergerie-applied',
        ];
    }
}
