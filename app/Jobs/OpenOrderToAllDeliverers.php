<?php

namespace App\Jobs;

use App\Models\Order;
use App\Services\OrderDispatchService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Fin de la période de priorité des livreurs favoris : si personne n'a pris la course, les autres
 * livreurs disponibles à proximité sont prévenus à leur tour (la course leur est visible dès cet instant).
 */
class OpenOrderToAllDeliverers implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public Order $order) {}

    public function handle(OrderDispatchService $dispatch): void
    {
        $order = $this->order->fresh();

        if ($order && $order->status === Order::STATUS_CREEE && $order->deliverer_id === null) {
            $dispatch->notifyNearbyDeliverers($order, 'others');
        }
    }
}
