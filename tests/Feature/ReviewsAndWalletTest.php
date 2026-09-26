<?php

namespace Tests\Feature;

use App\Jobs\ProcessScheduledPayouts;
use App\Models\Commission;
use App\Models\Deliverer;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Review;
use App\Services\AuditLogService;
use App\Services\FedaPayService;
use App\Services\OrderStatusService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

class ReviewsAndWalletTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    // ------------------------------------------- Autorisations sur les commandes

    public function test_client_sees_own_order_but_not_someone_elses(): void
    {
        $owner = $this->makeUser('client');
        $order = $this->makeOrder($owner, $this->makeDeliverer(), Order::STATUS_ACCEPTEE);

        $this->actingAs($owner, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertOk();
        $this->actingAs($this->makeUser('client'), 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertForbidden();
    }

    public function test_verified_deliverer_accepts_an_available_order_then_advances_it(): void
    {
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), null, Order::STATUS_CREEE);

        $this->actingAs($deliverer->user, 'sanctum');
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertOk()->assertJsonPath('status', 'acceptee');
        $this->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'colis_recupere'])
            ->assertOk()
            ->assertJsonPath('status', 'colis_recupere');
    }

    public function test_another_deliverer_cannot_move_an_order_they_do_not_own(): void
    {
        $owner = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), $owner, Order::STATUS_ACCEPTEE);

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')
            ->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'colis_recupere'])
            ->assertForbidden();
    }

    // ---------------------------------------------------------------- Avis

    public function test_client_reviews_a_delivered_order_and_the_average_is_recomputed(): void
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $first = $this->makeOrder($client, $deliverer, Order::STATUS_LIVREE);
        $second = $this->makeOrder($client, $deliverer, Order::STATUS_LIVREE);

        $this->actingAs($client, 'sanctum');
        $this->postJson("/api/v1/client/orders/{$first->id}/review", ['rating' => 5, 'comment' => 'Parfait'])->assertCreated();
        $this->postJson("/api/v1/client/orders/{$second->id}/review", ['rating' => 3])->assertCreated();

        $this->assertSame('4.00', $deliverer->fresh()->average_rating);
    }

    public function test_review_is_refused_before_delivery(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, $this->makeDeliverer(), Order::STATUS_EN_COURS_LIVRAISON);

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/review", ['rating' => 5])
            ->assertUnprocessable();
    }

    public function test_an_order_can_only_be_reviewed_once(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, $this->makeDeliverer(), Order::STATUS_LIVREE);

        $this->actingAs($client, 'sanctum');
        $this->postJson("/api/v1/client/orders/{$order->id}/review", ['rating' => 5])->assertCreated();
        $this->postJson("/api/v1/client/orders/{$order->id}/review", ['rating' => 1])->assertStatus(409);

        $this->assertSame(1, Review::count());
    }

    public function test_a_client_cannot_review_someone_elses_order(): void
    {
        $order = $this->makeOrder($this->makeUser('client'), $this->makeDeliverer(), Order::STATUS_LIVREE);

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/review", ['rating' => 5])
            ->assertForbidden();
    }

    public function test_rating_must_be_between_one_and_five(): void
    {
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, $this->makeDeliverer(), Order::STATUS_LIVREE);

        $this->actingAs($client, 'sanctum');
        $this->postJson("/api/v1/client/orders/{$order->id}/review", ['rating' => 6])->assertJsonValidationErrors('rating');
        $this->postJson("/api/v1/client/orders/{$order->id}/review", [])->assertJsonValidationErrors('rating');
    }

    public function test_deliverer_sees_only_their_own_reviews_with_first_name_only(): void
    {
        $client = $this->makeUser('client');
        $mine = $this->makeDeliverer();
        $other = $this->makeDeliverer();
        Review::create(['order_id' => $this->makeOrder($client, $mine, Order::STATUS_LIVREE)->id, 'client_id' => $client->id, 'deliverer_id' => $mine->id, 'rating' => 4, 'comment' => 'Bien']);
        Review::create(['order_id' => $this->makeOrder($client, $other, Order::STATUS_LIVREE)->id, 'client_id' => $client->id, 'deliverer_id' => $other->id, 'rating' => 1]);
        $mine->refreshStats();

        $this->actingAs($mine->user, 'sanctum')
            ->getJson('/api/v1/deliverer/reviews')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.client_first_name', $client->first_name)
            ->assertJsonPath('summary.count', 1)
            ->assertJsonPath('summary.average', 4)
            ->assertJsonMissingPath('data.0.client');
    }

    // ---------------------------------------------------------- Portefeuille

    public function test_delivery_credits_the_wallet_and_counts_the_delivery(): void
    {
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 2000);

        app(OrderStatusService::class)->transitionTo($order, Order::STATUS_LIVREE);

        $deliverer->refresh();
        $this->assertSame('1700.00', $deliverer->wallet_balance); // 2000 - 15 %
        $this->assertSame(1, $deliverer->total_deliveries);
    }

    public function test_a_redelivered_order_is_not_commissioned_twice(): void
    {
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 2000);
        $service = app(OrderStatusService::class);

        $service->transitionTo($order, Order::STATUS_LIVREE);
        $service->transitionTo($order->fresh(), Order::STATUS_LITIGE);
        $service->transitionTo($order->fresh(), Order::STATUS_LIVREE);

        $this->assertSame(1, Commission::count());
        $this->assertSame('1700.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_wallet_endpoint_lists_earnings_and_balance(): void
    {
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 2000);
        app(OrderStatusService::class)->transitionTo($order, Order::STATUS_LIVREE);

        $this->actingAs($deliverer->user, 'sanctum')
            ->getJson('/api/v1/deliverer/wallet')
            ->assertOk()
            ->assertJsonPath('balance', 1700)
            ->assertJsonPath('total_earned', 1700)
            ->assertJsonPath('total_paid', 0)
            ->assertJsonPath('earnings.0.order_reference', $order->reference)
            ->assertJsonPath('earnings.0.status', 'due');
    }

    public function test_wallet_is_closed_to_unvalidated_deliverers(): void
    {
        $pending = $this->makeDeliverer('pending');

        $this->actingAs($pending->user, 'sanctum')->getJson('/api/v1/deliverer/wallet')->assertForbidden();
    }

    public function test_mobile_money_number_is_normalized_to_the_national_format(): void
    {
        $deliverer = $this->makeDeliverer();
        $this->actingAs($deliverer->user, 'sanctum');

        foreach (['+229 01 46 62 05 83', '0146620583', '00229 0146620583'] as $input) {
            $this->patchJson('/api/v1/deliverer/wallet/mobile-money', ['mobile_money_number' => $input])
                ->assertOk()
                ->assertJsonPath('mobile_money_number', '0146620583');
        }

        $this->patchJson('/api/v1/deliverer/wallet/mobile-money', ['mobile_money_number' => '12 34'])
            ->assertJsonValidationErrors('mobile_money_number');
        $this->assertSame('0146620583', $deliverer->fresh()->mobile_money_number);
    }

    // ------------------------------------------------------------- Versements

    private function dueCommissionFor(Deliverer $deliverer): void
    {
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 2000);
        app(OrderStatusService::class)->transitionTo($order, Order::STATUS_LIVREE);
    }

    public function test_payout_job_pays_due_commissions_and_empties_the_wallet(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $this->dueCommissionFor($deliverer);

        $this->mock(FedaPayService::class)->shouldReceive('createPayout')->once()->with('0146620583', 1700.0, \Mockery::any())->andReturn(['id' => 99]);

        (new ProcessScheduledPayouts)->handle(app(FedaPayService::class), app(AuditLogService::class));

        $this->assertSame('paid', Payout::first()->status);
        $this->assertSame('hebdomadaire', Payout::first()->period_type);
        $this->assertSame('paid', Commission::first()->status);
        $this->assertSame('0.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_failed_payout_puts_commissions_back_in_the_queue(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $this->dueCommissionFor($deliverer);

        $this->mock(FedaPayService::class)->shouldReceive('createPayout')->andThrow(new RuntimeException('KO'));

        (new ProcessScheduledPayouts)->handle(app(FedaPayService::class), app(AuditLogService::class));

        $this->assertSame('failed', Payout::first()->status);
        $this->assertSame('due', Commission::first()->status);
        $this->assertNull(Commission::first()->payout_id);
        $this->assertSame('1700.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_payout_is_skipped_without_a_mobile_money_number(): void
    {
        $deliverer = $this->makeDeliverer();
        $this->dueCommissionFor($deliverer);

        $this->mock(FedaPayService::class)->shouldNotReceive('createPayout');

        (new ProcessScheduledPayouts)->handle(app(FedaPayService::class), app(AuditLogService::class));

        $this->assertSame(0, Payout::count());
        $this->assertSame('due', Commission::first()->status);
    }
}
