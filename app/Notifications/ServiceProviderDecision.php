<?php

namespace App\Notifications;

use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Pour le prestataire : l'administration a validé ou refusé son dossier.
 */
class ServiceProviderDecision extends Notification implements ShouldQueue
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
            'title' => $this->provider->status === 'approved' ? 'Dossier prestataire validé !' : 'Dossier prestataire refusé',
            'body' => $this->provider->status === 'approved' ? 'Les offres de prestation de votre métier sont disponibles.' : ($this->provider->rejection_reason ?: 'Consultez votre espace pour en savoir plus.'),
            'url' => config('app.frontend_url').'/prestataire/offres',
            'tag' => 'service-provider',
        ];
    }
}
