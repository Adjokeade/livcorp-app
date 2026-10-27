<?php

namespace App\Notifications;

use App\Models\ServiceProvider;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Pour les administrateurs : un prestataire de services a déposé sa candidature.
 */
class ServiceProviderApplied extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public ServiceProvider $provider) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable): array
    {
        return [
            'title' => 'Nouvelle candidature prestataire',
            'body' => "{$this->provider->first_name} {$this->provider->last_name} : ".(ServiceProvider::PROFESSIONS[$this->provider->profession] ?? $this->provider->profession),
            'url' => config('app.frontend_url').'/admin/prestataires',
            'tag' => 'service-provider',
        ];
    }
}
