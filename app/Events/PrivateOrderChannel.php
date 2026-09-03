<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;

/**
 * Canal privé Reverb/Pusher dédié à une commande : "order.{id}".
 * Autorisation définie dans routes/channels.php (le client ne peut s'abonner
 * qu'au canal de SA propre commande — cf. exigence sécurité).
 */
class PrivateOrderChannel extends PrivateChannel
{
    public function __construct(int $orderId)
    {
        parent::__construct("order.{$orderId}");
    }
}
