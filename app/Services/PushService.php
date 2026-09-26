<?php

namespace App\Services;

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Envoie une notification push à tous les appareils d'un utilisateur, et nettoie les
 * abonnements que le service push déclare expirés (appareil désinstallé, permission retirée).
 */
class PushService
{
    public function __construct(private readonly WebPushTransport $transport) {}

    public function enabled(): bool
    {
        return $this->transport->configured();
    }

    /**
     * @param  array{title: string, body?: string, url?: string, tag?: string}  $message
     * @return int nombre d'appareils atteints
     */
    public function sendToUser(User $user, array $message): int
    {
        if (! $this->enabled()) {
            return 0;
        }

        $payload = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $delivered = 0;

        foreach ($user->pushSubscriptions()->get() as $subscription) {
            try {
                $result = $this->transport->send([
                    'endpoint' => $subscription->endpoint,
                    'public_key' => $subscription->public_key,
                    'auth_token' => $subscription->auth_token,
                    'content_encoding' => $subscription->content_encoding,
                ], $payload);
            } catch (Throwable $e) {
                // Un appareil injoignable ne doit jamais empêcher les autres de recevoir la notification.
                Log::warning('Push : envoi impossible.', ['subscription' => $subscription->id, 'error' => $e->getMessage()]);

                continue;
            }

            if ($result['success']) {
                $delivered++;
                $subscription->forceFill(['last_used_at' => now()])->save();
            } elseif ($result['expired']) {
                $subscription->delete();
            } else {
                Log::warning('Push : refusé par le service.', ['subscription' => $subscription->id, 'status' => $result['status'], 'reason' => $result['reason']]);
            }
        }

        return $delivered;
    }
}
