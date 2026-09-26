<?php

namespace App\Notifications;

use App\Models\ContactMessage;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Pour les administrateurs : quelqu'un a écrit via le formulaire "Contactez-nous".
 */
class ContactMessageReceived extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public ContactMessage $message) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Nouveau message de contact',
            'body' => "{$this->message->name} : {$this->message->subject}",
            'url' => config('app.frontend_url').'/admin',
            'tag' => 'contact-message',
        ];
    }
}
