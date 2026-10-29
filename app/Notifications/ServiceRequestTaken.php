<?php

namespace App\Notifications;

use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Pour le client : un prestataire a pris son offre de prestation.
 */
class ServiceRequestTaken extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public ServiceRequest $request) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Votre offre a été prise',
            'body' => 'Un prestataire prend en charge : '.$this->request->title,
            'url' => config('app.frontend_url').'/client/services',
            'tag' => 'service-request-'.$this->request->id,
        ];
    }
}
