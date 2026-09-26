<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Review;
use App\Services\AuditLogService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Avis du client sur la livraison (1 à 5 étoiles + commentaire), une seule fois
 * par commande. La note moyenne du livreur est recalculée dans la foulée.
 */
class ReviewController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function store(Request $request, Order $order)
    {
        $this->authorize('view', $order); // le client ne note que SES commandes

        $validated = $request->validate([
            'rating' => 'required|integer|between:1,5',
            'comment' => 'nullable|string|max:500',
        ]);

        if ($order->status !== Order::STATUS_LIVREE || ! $order->deliverer_id) {
            return response()->json([
                'message' => 'Vous pourrez noter le livreur une fois le colis livré.',
            ], 422);
        }

        try {
            $review = DB::transaction(function () use ($order, $request, $validated) {
                $review = Review::create([
                    'order_id' => $order->id,
                    'client_id' => $request->user()->id,
                    'deliverer_id' => $order->deliverer_id,
                    'rating' => $validated['rating'],
                    'comment' => $validated['comment'] ?? null,
                ]);

                $order->deliverer->refreshStats();

                return $review;
            });
        } catch (UniqueConstraintViolationException) {
            return response()->json(['message' => 'Vous avez déjà noté cette livraison.'], 409);
        }

        $this->auditLog->log('review.created', $review, ['rating' => $review->rating]);

        return response()->json($review, 201);
    }
}
