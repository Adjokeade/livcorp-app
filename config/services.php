<?php

return [

    'fedapay' => [
        'env' => env('FEDAPAY_ENV', 'sandbox'),
        'public_key' => env('FEDAPAY_PUBLIC_KEY'),
        'secret_key' => env('FEDAPAY_SECRET_KEY'),
        'webhook_secret' => env('FEDAPAY_WEBHOOK_SECRET'),
    ],

    'maps' => [
        'provider' => env('MAPS_PROVIDER', 'osm'),
        'google_key' => env('GOOGLE_MAPS_API_KEY'),
    ],

    'commission' => [
        'rate_default' => env('COMMISSION_RATE_DEFAULT', 15),
        'payout_frequency' => env('COMMISSION_PAYOUT_FREQUENCY', 'weekly'),
    ],

    'brevo' => [
        'api_key' => env('BREVO_API_KEY'),
    ],

];
