<?php

namespace App\Notifications;

use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Pour les prestataires validés d'un métier : une nouvelle offre de prestation vient d'être publiée.
 */
class NewServiceRequest extends Notification implements ShouldQueue
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
            'title' => 'Nouvelle offre de prestation',
            'body' => $this->request->title.' · '.$this->request->city,
            'url' => config('app.frontend_url').($this->request->profession === 'conciergerie' ? '/conciergerie/missions' : '/prestataire/offres'),
            'tag' => 'service-request-'.$this->request->id,
        ];
    }
}
