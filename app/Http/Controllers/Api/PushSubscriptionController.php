<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use App\Services\PushService;
use Closure;
use Illuminate\Http\Request;

/**
 * Enregistrement des appareils qui reçoivent les notifications push de l'utilisateur.
 */
class PushSubscriptionController extends Controller
{
    /** Clé publique VAPID : nécessaire au navigateur pour s'abonner. Publique par nature. */
    public function config(PushService $push)
    {
        return response()->json([
            'enabled' => $push->enabled(),
            'public_key' => $push->enabled() ? config('services.webpush.public_key') : null,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            // Le serveur POSTera vers cette URL : uniquement un vrai service push (anti-SSRF).
            'endpoint' => ['required', 'url:'.(app()->environment(['local', 'testing']) ? 'http,https' : 'https'), 'max:2048', $this->allowedPushHost()],
            'keys.p256dh' => 'required|string|max:255',
            'keys.auth' => 'required|string|max:255',
            'contentEncoding' => 'nullable|in:aes128gcm,aesgcm',
        ]);

        // Un appareil n'appartient qu'à un utilisateur à la fois : s'il se connecte avec un autre
        // compte, l'abonnement change de propriétaire au lieu de doubler les notifications.
        $subscription = PushSubscription::updateOrCreate(
            ['endpoint_hash' => PushSubscription::hashEndpoint($validated['endpoint'])],
            [
                'user_id' => $request->user()->id,
                'endpoint' => $validated['endpoint'],
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'content_encoding' => $validated['contentEncoding'] ?? 'aes128gcm',
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
                'last_used_at' => now(),
            ],
        );

        return response()->json(['id' => $subscription->id], 201);
    }

    public function destroy(Request $request)
    {
        $validated = $request->validate(['endpoint' => 'required|string|max:2048']);

        // Limité aux abonnements de l'utilisateur connecté : on ne désabonne pas l'appareil d'un autre.
        $request->user()->pushSubscriptions()
            ->where('endpoint_hash', PushSubscription::hashEndpoint($validated['endpoint']))
            ->delete();

        return response()->json(['message' => 'Notifications désactivées sur cet appareil.']);
    }

    private function allowedPushHost(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            $host = strtolower((string) parse_url((string) $value, PHP_URL_HOST));

            $allowed = config('services.webpush.allowed_hosts', []);
            if (app()->environment(['local', 'testing'])) {
                $allowed = [...$allowed, 'localhost', '127.0.0.1'];
            }

            foreach ($allowed as $domain) {
                $domain = strtolower(trim($domain));
                if ($domain !== '' && ($host === $domain || str_ends_with($host, '.'.$domain))) {
                    return;
                }
            }

            $fail('Ce service de notifications n\'est pas pris en charge.');
        };
    }
}
