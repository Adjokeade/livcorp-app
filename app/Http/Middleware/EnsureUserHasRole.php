<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware de contrôle d'accès par rôle.
 *
 * Usage dans routes/api.php :
 *   Route::middleware(['auth:sanctum', 'role:admin'])->group(...)
 *   Route::middleware(['auth:sanctum', 'role:livreur,admin'])->group(...) // plusieurs rôles autorisés
 *
 * Exigence sécurité : chaque route sensible DOIT être protégée par ce middleware.
 * Aucun accès croisé entre profils n'est toléré (cf. cahier des charges §4.2).
 */
class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Compte désactivé. Contactez le support.'], 403);
        }

        if (! in_array($user->role, $roles, true)) {
            return response()->json(['message' => 'Accès refusé : rôle insuffisant.'], 403);
        }

        return $next($request);
    }
}
