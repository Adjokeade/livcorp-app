<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PriceOffer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Le livreur peut proposer un autre prix ; le client l'accepte ou le refuse.
 */
class PriceOffersTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function freeOrder(float $price = 3000): array
    {
        $client = $this->makeUser('client');

        return [$client, $this->makeOrder($client, null, Order::STATUS_CREEE, $price)];
    }

    private function offer(Order $order, $deliverer, int $amount, ?string $message = null)
    {
        return $this->actingAs($deliverer->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/offer", ['amount' => $amount, 'message' => $message]);
    }

    public function test_deliverer_counter_proposes_a_price_on_a_free_order(): void
    {
        [, $order] = $this->freeOrder();
        $deliverer = $this->makeDeliverer();

        $this->offer($order, $deliverer, 4000, 'Colis volumineux')
            ->assertCreated()
            ->assertJsonPath('offer.amount', '4000.00')
            ->assertJsonPath('offer.status', 'pending');

        $this->assertSame(Order::STATUS_CREEE, $order->fresh()->status); // rien n'est assigné tant que le client n'a pas dit oui
        $this->assertNull($order->fresh()->deliverer_id);
    }

    public function test_offer_equal_to_the_current_price_or_out_of_range_is_refused(): void
    {
        [, $order] = $this->freeOrder(3000);
        $deliverer = $this->makeDeliverer();

        $this->offer($order, $deliverer, 3000)->assertUnprocessable();
        $this->offer($order, $deliverer, 100)->assertJsonValidationErrors('amount');
    }

    public function test_a_deliverer_has_a_single_offer_per_order_which_he_can_edit(): void
    {
        [, $order] = $this->freeOrder();
        $deliverer = $this->makeDeliverer();

        $this->offer($order, $deliverer, 4000)->assertCreated();
        $this->offer($order, $deliverer, 3500)->assertCreated();

        $this->assertSame(1, PriceOffer::count());
        $this->assertSame('3500.00', PriceOffer::first()->amount);
    }

    public function test_client_sees_offers_without_the_deliverers_contact_details(): void
    {
        [$client, $order] = $this->freeOrder();
        $deliverer = $this->makeDeliverer();
        $this->offer($order, $deliverer, 4000, 'Colis volumineux');

        $this->actingAs($client, 'sanctum')
            ->getJson("/api/v1/client/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('offers.0.amount', '4000.00')
            ->assertJsonPath('offers.0.message', 'Colis volumineux')
            ->assertJsonPath('offers.0.deliverer.user.first_name', $deliverer->user->first_name)
            ->assertJsonMissingPath('offers.0.deliverer.user.email')
            ->assertJsonMissingPath('offers.0.deliverer.user.phone');
    }

    public function test_accepting_an_offer_sets_the_price_assigns_the_deliverer_and_declines_the_others(): void
    {
        [$client, $order] = $this->freeOrder();
        [$winner, $loser] = [$this->makeDeliverer(), $this->makeDeliverer()];
        $winning = $this->offer($order, $winner, 4000)->json('offer.id');
        $this->offer($order, $loser, 3800);

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/offers/{$winning}/accept")
            ->assertOk()
            ->assertJsonPath('order.status', 'acceptee')
            ->assertJsonPath('order.price', '4000.00')
            ->assertJsonPath('order.deliverer_id', $winner->id);

        $this->assertSame('accepted', PriceOffer::find($winning)->status);
        $this->assertSame('declined', PriceOffer::where('deliverer_id', $loser->id)->first()->status);
    }

    public function test_a_declined_offer_cannot_be_accepted_but_the_deliverer_can_offer_again(): void
    {
        [$client, $order] = $this->freeOrder();
        $deliverer = $this->makeDeliverer();
        $id = $this->offer($order, $deliverer, 4000)->json('offer.id');

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/offers/{$id}/decline")->assertOk();
        $this->postJson("/api/v1/client/orders/{$order->id}/offers/{$id}/accept")->assertStatus(409);

        $this->offer($order, $deliverer, 3600)->assertCreated();
        $this->assertSame('pending', PriceOffer::find($id)->status);
    }

    public function test_only_the_orders_owner_can_answer_offers(): void
    {
        [, $order] = $this->freeOrder();
        $id = $this->offer($order, $this->makeDeliverer(), 4000)->json('offer.id');

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/offers/{$id}/accept")
            ->assertForbidden();
    }

    public function test_an_offer_cannot_be_accepted_through_another_order(): void
    {
        [$client, $order] = $this->freeOrder();
        $other = $this->makeOrder($client, null, Order::STATUS_CREEE);
        $id = $this->offer($order, $this->makeDeliverer(), 4000)->json('offer.id');

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$other->id}/offers/{$id}/accept")
            ->assertNotFound();
    }

    public function test_deliverer_can_request_a_revision_after_accepting_and_the_client_validates_it(): void
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, Order::STATUS_ACCEPTEE, 3000);

        $id = $this->offer($order, $deliverer, 3500, 'Le colis est plus lourd que sur la photo')->json('offer.id');

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/offers/{$id}/accept")
            ->assertOk()
            ->assertJsonPath('order.price', '3500.00')
            ->assertJsonPath('order.status', 'acceptee')
            ->assertJsonPath('order.deliverer_id', $deliverer->id);
    }

    public function test_only_the_assigned_deliverer_can_request_a_revision(): void
    {
        $order = $this->makeOrder($this->makeUser('client'), $this->makeDeliverer(), Order::STATUS_ACCEPTEE, 3000);

        $this->offer($order, $this->makeDeliverer(), 3500)->assertUnprocessable();
    }

    public function test_price_is_locked_once_the_parcel_is_picked_up(): void
    {
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_COLIS_RECUPERE, 3000);

        $this->offer($order, $deliverer, 3500)->assertUnprocessable();
    }

    public function test_accepting_the_order_at_the_asked_price_declines_pending_offers(): void
    {
        [, $order] = $this->freeOrder();
        [$offering, $accepting] = [$this->makeDeliverer(), $this->makeDeliverer()];
        $this->offer($order, $offering, 4000);

        $this->actingAs($accepting->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertOk();

        $this->assertSame('declined', PriceOffer::first()->status);
    }

    public function test_available_orders_show_my_offer_and_the_offer_can_be_withdrawn(): void
    {
        [, $order] = $this->freeOrder();
        $deliverer = $this->makeDeliverer();
        $this->offer($order, $deliverer, 4000, 'Trop lourd');

        $this->getJson('/api/v1/deliverer/orders/available')
            ->assertJsonPath('data.0.my_offer.amount', '4000.00')
            ->assertJsonPath('data.0.my_offer.status', 'pending');

        $this->deleteJson("/api/v1/deliverer/orders/{$order->id}/offer")->assertOk();
        $this->assertSame('withdrawn', PriceOffer::first()->status);
        $this->getJson('/api/v1/deliverer/orders/available')->assertJsonPath('data.0.my_offer.status', 'withdrawn');
    }

    public function test_client_history_counts_pending_offers(): void
    {
        [$client, $order] = $this->freeOrder();
        $this->offer($order, $this->makeDeliverer(), 4000);
        $this->offer($order, $this->makeDeliverer(), 3700);

        $this->actingAs($client, 'sanctum')
            ->getJson('/api/v1/client/orders')
            ->assertJsonPath('data.0.pending_offers_count', 2);
    }
}
