<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PriceOffer;
use App\Notifications\PriceOfferReceived;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/**
 * Le livreur propose un autre prix que celui fixé par le client. Le client tranche.
 * Possible sur une course libre, ou sur "sa" course avant le retrait du colis
 * (le colis vu de près est plus gros ou plus lourd que sur la photo, par exemple).
 */
class OfferController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function store(Request $request, Order $order)
    {
        $deliverer = $request->user()->deliverer;

        $validated = $request->validate([
            'amount' => 'required|integer|between:'.config('services.orders.min_price').','.config('services.orders.max_price'),
            'message' => 'nullable|string|max:300',
        ]);

        $isFree = $order->status === Order::STATUS_CREEE && $order->deliverer_id === null;
        $isMine = $order->status === Order::STATUS_ACCEPTEE && $order->deliverer_id === $deliverer->id;

        if (! $isFree && ! $isMine) {
            return response()->json([
                'message' => 'Cette course n\'accepte plus de proposition de prix.',
            ], 422);
        }

        if ($order->releases()->where('deliverer_id', $deliverer->id)->exists()) {
            return response()->json(['message' => 'Vous vous êtes désisté de cette course : vous ne pouvez plus proposer de prix.'], 409);
        }

        if ((float) $validated['amount'] === (float) $order->price) {
            return response()->json([
                'message' => 'C\'est déjà le prix demandé : acceptez simplement la course.',
            ], 422);
        }

        // Une seule offre par livreur : il modifie la sienne (même après un refus) au lieu d'en empiler.
        $offer = PriceOffer::updateOrCreate(
            ['order_id' => $order->id, 'deliverer_id' => $deliverer->id],
            ['amount' => $validated['amount'], 'message' => $validated['message'] ?? null, 'status' => 'pending'],
        );

        $this->auditLog->log('offer.created', $offer, ['amount' => $offer->amount]);

        // Le client est prévenu tout de suite : c'est à lui de répondre.
        rescue(fn () => $order->client->notify(new PriceOfferReceived($offer->load('deliverer.user'), revision: $isMine)));

        return response()->json(['offer' => $offer], 201);
    }

    public function destroy(Request $request, Order $order)
    {
        $offer = $order->offers()
            ->where('deliverer_id', $request->user()->deliverer->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $offer->update(['status' => 'withdrawn']);

        return response()->json(['offer' => $offer]);
    }
}
