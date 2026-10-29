<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Les missions de conciergerie ne s'ouvrent qu'aux comptes conciergerie validés par l'administration. */
class EnsureConciergerieIsApproved
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user?->isConciergerie()) {
            return response()->json(['message' => 'Accès refusé : réservé aux comptes conciergerie.'], 403);
        }

        if ($user->conciergerie_status !== 'approved') {
            return response()->json(['message' => 'Votre compte conciergerie est en attente de validation par l\'administrateur.'], 403);
        }

        return $next($request);
    }
}
