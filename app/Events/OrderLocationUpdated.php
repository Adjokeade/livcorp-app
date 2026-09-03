<?php

namespace App\Events;

use App\Models\Order;
use App\Models\TrackingPoint;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Diffusé à chaque mise à jour de position GPS du livreur pendant une livraison.
 * Le frontend client s'abonne au canal privé "order.{id}" pour afficher le
 * suivi en temps réel sur la carte (cf. cahier des charges §3.1).
 */
class OrderLocationUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order,
        public TrackingPoint $point,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateOrderChannel($this->order->id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'order.location.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->order->id,
            'lat' => $this->point->lat,
            'lng' => $this->point->lng,
            'recorded_at' => $this->point->recorded_at->toIso8601String(),
        ];
    }
}
