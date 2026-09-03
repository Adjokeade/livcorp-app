<?php

use App\Http\Middleware\EnsureDelivererIsVerified;
use App\Http\Middleware\EnsureEmailIsVerified;
use App\Http\Middleware\EnsureUserHasRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withProviders([
        App\Providers\AuthServiceProvider::class,
    ])
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);

        // Alias utilisés dans routes/api.php : middleware('role:admin'), etc.
        $middleware->alias([
            'role' => EnsureUserHasRole::class,
            'verified.email' => EnsureEmailIsVerified::class,
            'deliverer.verified' => EnsureDelivererIsVerified::class,
        ]);

        // Rate limiting sur les routes sensibles (connexion, paiement) — cf. exigence sécurité
        $middleware->throttleApi();
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
