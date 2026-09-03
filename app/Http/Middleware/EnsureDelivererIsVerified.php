<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Empêche un livreur non validé par l'administrateur d'accepter des courses.
 * Cf. cahier des charges §3.4 : activation du compte livreur uniquement après validation.
 */
class EnsureDelivererIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $deliverer = $request->user()?->deliverer;

        if (! $deliverer || $deliverer->verification_status !== 'approved') {
            return response()->json([
                'message' => 'Votre compte livreur est en attente de validation par l\'administrateur.',
            ], 403);
        }

        return $next($request);
    }
}
