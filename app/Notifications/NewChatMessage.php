<?php

namespace App\Notifications;

use App\Models\OrderMessage;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Nouveau message dans la conversation d'une commande.
 */
class NewChatMessage extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public OrderMessage $message, public User $from, public string $url) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        $preview = mb_strlen($this->message->body) > 90 ? mb_substr($this->message->body, 0, 90).'…' : $this->message->body;

        return [
            'title' => "{$this->from->first_name} vous a écrit",
            'body' => $preview,
            'url' => $this->url,
            'tag' => "chat-{$this->message->order_id}",
        ];
    }
}
