<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PriceOffer;
use App\Notifications\OrderCancelledByClient;
use App\Notifications\OrderStatusUpdatedForClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Le client peut annuler tant que le livreur n'a pas récupéré le colis.
 */
class OrderCancellationTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function cancel(Order $order, $client, array $body = [])
    {
        return $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/cancel", $body);
    }

    public function test_a_free_order_can_be_cancelled(): void
    {
        Notification::fake();
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, null, Order::STATUS_CREEE);

        $this->cancel($order, $client, ['reason' => 'Je me suis trompé d\'adresse'])
            ->assertOk()
            ->assertJsonPath('order.status', 'annulee');

        $order->refresh();
        $this->assertNotNull($order->cancelled_at);
        $this->assertSame('Annulée par le client : Je me suis trompé d\'adresse', $order->statusHistory()->latest('id')->first()->note);
        Notification::assertSentTo($client, OrderStatusUpdatedForClient::class);
    }

    public function test_an_accepted_order_can_be_cancelled_and_the_deliverer_is_told(): void
    {
        Notification::fake();
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, Order::STATUS_ACCEPTEE);

        $this->cancel($order, $client)->assertOk()->assertJsonPath('order.status', 'annulee');

        Notification::assertSentTo($deliverer->user, OrderCancelledByClient::class, fn ($n) => $n->wasAssigned === true);
    }

    public function test_deliverers_with_a_pending_offer_are_told_and_their_offers_fall(): void
    {
        Notification::fake();
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, null, Order::STATUS_CREEE);
        $bidder = $this->makeDeliverer();
        PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $bidder->id, 'amount' => 4000]);

        $this->cancel($order, $client)->assertOk();

        $this->assertSame('declined', PriceOffer::first()->status);
        Notification::assertSentTo($bidder->user, OrderCancelledByClient::class, fn ($n) => $n->wasAssigned === false);
    }

    public function test_it_is_refused_once_the_parcel_is_picked_up(): void
    {
        foreach ([Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON, Order::STATUS_LIVREE] as $status) {
            $client = $this->makeUser('client');
            $order = $this->makeOrder($client, $this->makeDeliverer(), $status);

            $this->cancel($order, $client)
                ->assertUnprocessable()
                ->assertJsonPath('message', 'Le livreur a déjà récupéré le colis : la commande ne peut plus être annulée. En cas de problème, contactez-nous.');

            $this->assertSame($status, $order->fresh()->status);
        }
    }

    public function test_an_order_cannot_be_cancelled_twice(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, null, Order::STATUS_CREEE);

        $this->cancel($order, $client)->assertOk();
        $this->cancel($order, $client)->assertUnprocessable()->assertJsonPath('message', 'Cette commande est déjà annulée.');
    }

    public function test_only_the_owner_can_cancel(): void
    {
        $order = $this->makeOrder($this->makeUser('client'), null, Order::STATUS_CREEE);

        $this->cancel($order, $this->makeUser('client'))->assertForbidden();
        $this->assertSame(Order::STATUS_CREEE, $order->fresh()->status);
    }

    public function test_a_cancelled_order_leaves_the_marketplace_and_the_available_list(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, null, Order::STATUS_CREEE);
        $this->cancel($order, $client)->assertOk();

        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(0, 'data');
        $this->actingAs($this->makeDeliverer()->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(0, 'data');
    }

    public function test_a_deliverer_who_opened_the_course_before_the_cancellation_gets_a_clear_answer(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, null, Order::STATUS_CREEE);
        $this->cancel($order, $client)->assertOk();

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/accept")
            ->assertStatus(409)
            ->assertJsonPath('message', "Cette course n'est plus disponible : elle a été prise par un autre livreur ou annulée.");
    }

    public function test_a_course_already_taken_gets_the_same_clear_answer_instead_of_an_authorization_error(): void
    {
        $order = $this->makeOrder($this->makeUser('client'), $this->makeDeliverer(), Order::STATUS_ACCEPTEE);

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/accept")
            ->assertStatus(409);
        $this->assertNotNull($order->fresh()->deliverer_id);
    }

    public function test_offers_and_payment_are_closed_on_a_cancelled_order(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, null, Order::STATUS_CREEE);
        $this->cancel($order, $client)->assertOk();

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/offer", ['amount' => 4000])
            ->assertUnprocessable();
        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])
            ->assertUnprocessable();
    }
}
