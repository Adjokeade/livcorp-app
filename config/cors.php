<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS)
    |--------------------------------------------------------------------------
    |
    | La SPA React (Vite, http://localhost:5173) et l'API Laravel
    | (http://localhost:8000) sont sur deux origines distinctes : sans cette
    | configuration, le navigateur bloque toutes les requêtes XHR du front.
    |
    | L'authentification se fait par token Bearer (Sanctum personal access
    | tokens) et non par cookie de session : supports_credentials reste donc
    | à false. Si un jour on bascule en mode "SPA cookie", il faudra passer
    | supports_credentials à true ET lister des origines explicites (pas de "*").
    |
    */

    'paths' => ['api/*', 'broadcasting/auth', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:4173', // vite preview (test de la PWA construite)
        'http://127.0.0.1:4173',
    ]))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
