<?php

namespace App\Notifications\Channels;

use App\Services\PushService;
use Illuminate\Notifications\Notification;

/**
 * Canal de notification push. Une notification l'utilise en listant WebPushChannel::class dans
 * via() et en définissant toWebPush($notifiable) : ['title' => …, 'body' => …, 'url' => …, 'tag' => …].
 */
class WebPushChannel
{
    public function __construct(private readonly PushService $push) {}

    public function send(object $notifiable, Notification $notification): void
    {
        if (! method_exists($notification, 'toWebPush') || ! method_exists($notifiable, 'pushSubscriptions')) {
            return;
        }

        $this->push->sendToUser($notifiable, $notification->toWebPush($notifiable));
    }
}
