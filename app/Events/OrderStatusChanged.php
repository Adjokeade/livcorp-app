<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Diffusé à chaque changement de statut d'une commande (accepté, récupéré,
 * livré...) pour mettre à jour l'écran de suivi du client en temps réel,
 * avec le ton "hyper humain" attendu (message personnalisé côté frontend).
 */
class OrderStatusChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order,
        public string $previousStatus,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateOrderChannel($this->order->id)];
    }

    public function broadcastAs(): string
    {
        return 'order.status.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->order->id,
            'status' => $this->order->status,
            'previous_status' => $this->previousStatus,
        ];
    }
}
