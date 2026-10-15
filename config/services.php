<?php

return [

    // KKiaPay (Mobile Money et carte). Les trois clés viennent de Développeurs > Clés API du tableau de bord KKiaPay ;
    // `webhook_secret` est le « secret hash » saisi à la création du webhook. Les clés privée et secrète ne quittent
    // JAMAIS le serveur : seule la clé publique est transmise au navigateur pour ouvrir le widget.
    'kkiapay' => [
        'sandbox' => (bool) env('KKIAPAY_SANDBOX', true),
        'public_key' => env('KKIAPAY_PUBLIC_KEY'),
        'private_key' => env('KKIAPAY_PRIVATE_KEY'),
        'secret' => env('KKIAPAY_SECRET'),
        'webhook_secret' => env('KKIAPAY_WEBHOOK_SECRET'),
    ],

    'maps' => [
        'provider' => env('MAPS_PROVIDER', 'osm'),
        'google_key' => env('GOOGLE_MAPS_API_KEY'),
        // Itinéraires routiers (OSRM). Le serveur de démonstration convient au développement ;
        // en production, héberger sa propre instance ou changer d'URL ici.
        'osrm_url' => env('OSRM_URL', 'https://router.project-osrm.org'),
    ],

    // Notifications push (Web Push / VAPID). Clés : php artisan push:vapid
    'webpush' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:contact@livcorp.bj'),
        // Le serveur POSTe vers l'URL fournie par le navigateur : on ne l'accepte que pour les vrais
        // services push, sinon un utilisateur pourrait faire viser une adresse interne (SSRF).
        'allowed_hosts' => array_values(array_filter(array_merge(
            ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'],
            explode(',', (string) env('WEBPUSH_EXTRA_HOSTS', '')),
        ))),
        // Rayon (km) autour du point de collecte dans lequel un livreur disponible est alerté d'une nouvelle course.
        'notify_radius_km' => (int) env('WEBPUSH_NOTIFY_RADIUS_KM', 15),
    ],

    'admin' => [
        // Durée de la session administrateur : plus courte que celle des clients (24 h).
        'token_minutes' => (int) env('ADMIN_TOKEN_MINUTES', 480),
    ],

    'orders' => [
        'min_price' => (int) env('ORDER_MIN_PRICE', 500),      // FCFA
        'max_price' => (int) env('ORDER_MAX_PRICE', 1000000),  // FCFA, garde-fou contre les fautes de frappe
        'max_distance_km' => (int) env('ORDER_MAX_DISTANCE_KM', 100),
        'min_distance_km' => 0.1,
        'arrival_radius_m' => (int) env('ORDER_ARRIVAL_RADIUS_M', 500),          // "Je suis arrivé" accepté à moins de 500 m du point
        'auto_confirm_hours' => (int) env('ORDER_AUTO_CONFIRM_HOURS', 24),        // réception confirmée d'office si l'expéditeur ne répond pas
        'unpaid_expiry_minutes' => (int) env('ORDER_UNPAID_EXPIRY_MINUTES', 30),  // une livraison créée mais jamais payée est annulée
        'unreachable_wait_min' => (int) env('ORDER_UNREACHABLE_WAIT_MIN', 10),   // attente minimale avant "destinataire injoignable"
        'code_max_attempts' => 5,
        'code_lock_minutes' => 15,
    ],

    'commission' => [
        'rate_default' => env('COMMISSION_RATE_DEFAULT', 15),
        'payout_frequency' => env('COMMISSION_PAYOUT_FREQUENCY', 'weekly'),
    ],

    'brevo' => [
        'api_key' => env('BREVO_API_KEY'),
    ],

];
