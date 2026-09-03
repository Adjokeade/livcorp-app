<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Events\OrderLocationUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Deliverer\PushLocationRequest;
use App\Http\Requests\Deliverer\UpdateOrderStatusRequest;
use App\Models\Order;
use App\Models\TrackingPoint;
use App\Services\OrderStatusService;
use Illuminate\Http\Request;

/**
 * Actions du livreur sur les commandes.
 * Routes protégées par : auth:sanctum, role:livreur, deliverer.verified
 */
class OrderController extends Controller
{
    public function __construct(private readonly OrderStatusService $statusService) {}

    public function available(Request $request)
    {
        return Order::where('status', Order::STATUS_CREEE)
            ->whereNull('deliverer_id')
            ->latest()
            ->paginate(15);
    }

    public function myOrders(Request $request)
    {
        return $request->user()->deliverer
            ->orders()
            ->with(['client', 'merchant'])
            ->latest()
            ->paginate(15);
    }

    public function accept(Request $request, Order $order)
    {
        $this->authorize('accept', $order);

        $order->deliverer_id = $request->user()->deliverer->id;
        $order->save();

        $this->statusService->transitionTo($order, Order::STATUS_ACCEPTEE);

        return $order->fresh(['client', 'merchant']);
    }

    public function updateStatus(UpdateOrderStatusRequest $request, Order $order)
    {
        $this->authorize('updateStatus', $order);

        $validated = $request->validated();

        return $this->statusService->transitionTo($order, $validated['status'], $validated['note'] ?? null);
    }

    /**
     * Point GPS envoyé périodiquement par l'app du livreur pendant une livraison en cours.
     * Diffusé en temps réel au client via WebSocket (canal privé "order.{id}").
     */
    public function pushLocation(PushLocationRequest $request, Order $order)
    {
        $this->authorize('updateStatus', $order); // même règle : livreur assigné uniquement

        $deliverer = $request->user()->deliverer;
        $validated = $request->validated();

        $point = TrackingPoint::create([
            'order_id' => $order->id,
            'deliverer_id' => $deliverer->id,
            'lat' => $validated['lat'],
            'lng' => $validated['lng'],
            'recorded_at' => now(),
        ]);

        $deliverer->update([
            'current_lat' => $validated['lat'],
            'current_lng' => $validated['lng'],
            'location_updated_at' => now(),
        ]);

        broadcast(new OrderLocationUpdated($order, $point))->toOthers();

        return response()->json(['message' => 'Position mise à jour.']);
    }
}
