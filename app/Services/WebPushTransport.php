<?php

namespace App\Services;

use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Envoi effectif d'une notification chiffrée (VAPID + aes128gcm) au service push du navigateur.
 * Isolé dans une classe pour que les tests puissent le remplacer sans réseau.
 */
class WebPushTransport
{
    public function configured(): bool
    {
        return filled(config('services.webpush.public_key')) && filled(config('services.webpush.private_key'));
    }

    /**
     * @param  array{endpoint: string, public_key: string, auth_token: string, content_encoding?: string}  $subscription
     * @return array{success: bool, expired: bool, status: ?int, reason: ?string}
     */
    public function send(array $subscription, string $payload, int $ttl = 86400, string $urgency = 'normal'): array
    {
        $client = new WebPush(['VAPID' => [
            'subject' => config('services.webpush.subject'),
            'publicKey' => config('services.webpush.public_key'),
            'privateKey' => config('services.webpush.private_key'),
        ]], ['TTL' => $ttl, 'urgency' => $urgency, 'timeout' => 10]);

        $report = $client->sendOneNotification(
            Subscription::create([
                'endpoint' => $subscription['endpoint'],
                'publicKey' => $subscription['public_key'],
                'authToken' => $subscription['auth_token'],
                'contentEncoding' => $subscription['content_encoding'] ?? 'aes128gcm',
            ]),
            $payload,
        );

        return [
            'success' => $report->isSuccess(),
            'expired' => $report->isSubscriptionExpired(), // 404 / 410 : l'abonnement n'existe plus
            'status' => $report->getResponse()?->getStatusCode(),
            'reason' => $report->getReason(),
        ];
    }
}
