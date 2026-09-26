<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PriceOffer;
use App\Notifications\PriceOfferAnswered;
use App\Services\AuditLogService;
use App\Services\OrderStatusService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Le client répond aux contre-propositions de prix des livreurs.
 *  - course encore libre : accepter une offre fixe le prix ET assigne le livreur ;
 *  - course déjà acceptée (demande de révision du livreur assigné, avant le retrait
 *    du colis) : accepter ne change que le prix.
 */
class OfferController extends Controller
{
    public function __construct(
        private readonly OrderStatusService $statusService,
        private readonly AuditLogService $auditLog,
    ) {}

    public function accept(Request $request, Order $order, PriceOffer $offer)
    {
        $this->authorize('view', $order);

        $result = DB::transaction(function () use ($order, $offer) {
            // Verrous : deux acceptations simultanées (ou une offre retirée entre-temps) ne doivent pas passer.
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $offer = PriceOffer::whereKey($offer->id)->lockForUpdate()->firstOrFail();

            if ($offer->status !== 'pending') {
                return ['error' => 'Cette offre n\'est plus valable.'];
            }

            $isFreeOrder = $order->status === Order::STATUS_CREEE && $order->deliverer_id === null;
            $isRevision = $order->status === Order::STATUS_ACCEPTEE && $order->deliverer_id === $offer->deliverer_id;

            if (! $isFreeOrder && ! $isRevision) {
                return ['error' => 'Cette commande n\'accepte plus de changement de prix.'];
            }

            $order->price = $offer->amount;
            if ($isFreeOrder) {
                $order->deliverer_id = $offer->deliverer_id;
            }
            $order->save();

            $offer->update(['status' => 'accepted']);
            $declined = $order->offers()->where('status', 'pending')->whereKeyNot($offer->id)->get();
            $order->offers()->where('status', 'pending')->whereKeyNot($offer->id)->update(['status' => 'declined']);

            if ($isFreeOrder) {
                $this->statusService->transitionTo($order, Order::STATUS_ACCEPTEE);
            }

            return ['order' => $order->fresh(Order::DELIVERER_PUBLIC), 'declined' => $declined];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 409);
        }

        $this->auditLog->log('offer.accepted', $offer, ['amount' => $offer->amount]);

        // Hors transaction : le livreur retenu et ceux qui ne le sont pas sont prévenus une fois la décision enregistrée.
        rescue(fn () => $offer->deliverer->user->notify(new PriceOfferAnswered($offer->load('order'), 'accepted')));
        foreach ($result['declined'] as $other) {
            rescue(fn () => $other->deliverer->user->notify(new PriceOfferAnswered($other->load('order'), 'declined')));
        }

        return response()->json(['order' => $result['order']]);
    }

    public function decline(Request $request, Order $order, PriceOffer $offer)
    {
        $this->authorize('view', $order);

        if ($offer->status !== 'pending') {
            return response()->json(['message' => 'Cette offre n\'est plus valable.'], 409);
        }

        $offer->update(['status' => 'declined']);
        $this->auditLog->log('offer.declined', $offer);

        rescue(fn () => $offer->deliverer->user->notify(new PriceOfferAnswered($offer->load('order'), 'declined')));

        return response()->json(['offer' => $offer]);
    }
}
