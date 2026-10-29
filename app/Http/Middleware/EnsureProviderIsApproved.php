<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Les offres de prestation ne sont accessibles au prestataire qu'une fois son dossier validé par l'administration. */
class EnsureProviderIsApproved
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->serviceProvider?->status !== 'approved') {
            return response()->json(['message' => 'Votre dossier prestataire est en attente de validation par l\'administrateur.'], 403);
        }

        return $next($request);
    }
}
