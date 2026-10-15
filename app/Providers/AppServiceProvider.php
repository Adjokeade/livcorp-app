<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Très vieux MySQL/MariaDB : un index sur une colonne de 255 caractères utf8mb4 (1020 octets) dépasse la limite
        // (767 ou 1000 octets). Avec DB_LEGACY_MYSQL=true, les colonnes texte des NOUVELLES migrations font 191 caractères.
        if (config('database.connections.mysql.legacy') || config('database.connections.mariadb.legacy')) {
            Schema::defaultStringLength(191);
        }

        // Limiteur du groupe "api" (référencé par $middleware->throttleApi()
        // dans bootstrap/app.php). 60 requêtes/minute par utilisateur, sinon par IP.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });
    }
}
