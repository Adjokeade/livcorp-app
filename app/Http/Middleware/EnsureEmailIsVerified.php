<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloque l'accès aux actions sensibles (création de commande, paiement, etc.)
 * tant que l'adresse e-mail n'est pas vérifiée. Cf. cahier des charges §4.2.
 */
class EnsureEmailIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || is_null($user->email_verified_at)) {
            return response()->json([
                'message' => 'Veuillez vérifier votre adresse e-mail avant de continuer.',
            ], 403);
        }

        return $next($request);
    }
}
