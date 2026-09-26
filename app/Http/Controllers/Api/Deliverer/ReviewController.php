<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * Avis reçus par le livreur connecté. Seul le prénom du client est exposé.
 */
class ReviewController extends Controller
{
    public function index(Request $request)
    {
        $deliverer = $request->user()->deliverer;

        $reviews = $deliverer->reviews()
            ->with(['client:id,first_name', 'order:id,reference'])
            ->latest()
            ->paginate(10)
            ->through(fn ($review) => [
                'id' => $review->id,
                'rating' => $review->rating,
                'comment' => $review->comment,
                'client_first_name' => $review->client?->first_name,
                'order_reference' => $review->order?->reference,
                'created_at' => $review->created_at,
            ]);

        return response()->json([
            ...$reviews->toArray(),
            'summary' => [
                'average' => (float) $deliverer->average_rating,
                'count' => $deliverer->reviews()->count(),
            ],
        ]);
    }
}
