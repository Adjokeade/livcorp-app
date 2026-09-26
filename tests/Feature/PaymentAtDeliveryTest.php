<?php

namespace Tests\Feature;

use App\Jobs\ProcessScheduledPayouts;
use App\Models\Commission;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Transaction;
use App\Services\AuditLogService;
use App\Services\FedaPayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Le client paie à la réception du colis, devant le livreur, qui voit le statut
 * du paiement et ne peut clôturer la course avant sa validation.
 */
class PaymentAtDeliveryTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    /** Course en route, pas encore payée. */
    private function unpaidRoute(float $price = 3000): array
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, $price, 'en_ligne', [
            'payment_status' => 'en_attente',
            'payment_method' => null,
        ]);

        return [$client, $deliverer, $order];
    }

    public function test_creating_an_order_needs_no_payment_and_no_fedapay_call(): void
    {
        Storage::fake('parcel_photos');
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [[
            'distance' => 9190, 'duration' => 600, 'geometry' => ['coordinates' => [[2.41, 6.36], [2.36, 6.35]]],
        ]]])]);
        $this->mock(FedaPayService::class)->shouldNotReceive('createTransactionForOrder');

        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson('/api/v1/client/orders', [
            'type' => 'colis',
            'pickup_address' => 'Dantokpa', 'pickup_lat' => 6.36, 'pickup_lng' => 2.41,
            'dropoff_address' => 'Fidjrossè', 'dropoff_lat' => 6.35, 'dropoff_lng' => 2.36,
            'recipient_name' => 'Koffi', 'recipient_phone' => '+22901000000',
            'price' => 1500,
            'photo' => UploadedFile::fake()->image('colis.jpg', 800, 600),
        ])->assertCreated()
            ->assertJsonPath('order.status', 'creee')
            ->assertJsonPath('order.payment_status', 'en_attente');
    }

    public function test_unpaid_orders_are_visible_to_deliverers(): void
    {
        $this->makeOrder($this->makeUser('client'), null, Order::STATUS_CREEE);

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')
            ->getJson('/api/v1/deliverer/orders/available')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_client_validates_a_cash_payment_and_the_deliverer_sees_it(): void
    {
        [$client, $deliverer, $order] = $this->unpaidRoute();

        $this->actingAs($deliverer->user, 'sanctum')
            ->getJson('/api/v1/deliverer/orders/mine')
            ->assertJsonPath('data.0.payment_status', 'en_attente');

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])
            ->assertOk()
            ->assertJsonPath('order.payment_status', 'paye')
            ->assertJsonPath('order.payment_method', 'especes');

        $this->actingAs($deliverer->user, 'sanctum')
            ->getJson('/api/v1/deliverer/orders/mine')
            ->assertJsonPath('data.0.payment_status', 'paye')
            ->assertJsonPath('data.0.payment_method', 'especes');
    }

    public function test_payment_cannot_be_validated_twice(): void
    {
        [$client, , $order] = $this->unpaidRoute();
        $this->actingAs($client, 'sanctum');

        $this->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])->assertOk();
        $this->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])->assertStatus(409);
    }

    public function test_payment_is_refused_before_the_deliverer_is_on_the_way(): void
    {
        $order = $this->makeOrder($client = $this->makeUser('client'), $this->makeDeliverer(), Order::STATUS_ACCEPTEE);

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])
            ->assertUnprocessable();
    }

    public function test_a_client_cannot_pay_someone_elses_order(): void
    {
        [, , $order] = $this->unpaidRoute();

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])
            ->assertForbidden();
    }

    public function test_online_payment_returns_the_fedapay_transaction_to_open(): void
    {
        [$client, , $order] = $this->unpaidRoute();
        $transaction = new Transaction(['order_id' => $order->id, 'fedapay_transaction_id' => '4242', 'status' => 'pending']);
        $this->mock(FedaPayService::class)->shouldReceive('createTransactionForOrder')->once()->andReturn($transaction);

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'en_ligne'])
            ->assertOk()
            ->assertJsonPath('payment.fedapay_transaction_id', '4242')
            ->assertJsonPath('order.payment_status', 'en_attente');
    }

    public function test_online_payment_failure_suggests_cash_instead_of_crashing(): void
    {
        [$client, , $order] = $this->unpaidRoute();
        $this->mock(FedaPayService::class)->shouldReceive('createTransactionForOrder')->andThrow(new RuntimeException('KO'));

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'en_ligne'])
            ->assertStatus(502)
            ->assertJsonPath('message', 'Le paiement en ligne est momentanément indisponible. Vous pouvez payer en espèces.');
    }

    public function test_deliverer_cannot_complete_an_unpaid_delivery(): void
    {
        [, $deliverer, $order] = $this->unpaidRoute();

        $this->actingAs($deliverer->user, 'sanctum')
            ->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'livree'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Le paiement n\'est pas encore validé par le client.');

        $this->assertSame(Order::STATUS_EN_COURS_LIVRAISON, $order->fresh()->status);
    }

    public function test_deliverer_completes_once_paid_and_cash_leaves_a_commission_debt(): void
    {
        [$client, $deliverer, $order] = $this->unpaidRoute(3000);

        $this->actingAs($client, 'sanctum')
            ->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])->assertOk();

        $this->actingAs($deliverer->user, 'sanctum')
            ->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'livree'])
            ->assertOk()
            ->assertJsonPath('status', 'livree');

        // Il a encaissé 3 000 en main propre : il doit 15 % (450) à LIV corp.
        $this->assertSame('-450.00', Commission::first()->net_amount);
        $this->assertSame('-450.00', $deliverer->fresh()->wallet_balance);

        $this->getJson('/api/v1/deliverer/wallet')
            ->assertJsonPath('balance', -450)
            ->assertJsonPath('total_earned', 2550)
            ->assertJsonPath('cash_collected', 3000)
            ->assertJsonPath('earnings.0.payment_method', 'especes');
    }

    public function test_online_payment_credits_the_deliverer_with_the_net_amount(): void
    {
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'en_ligne');

        $this->actingAs($deliverer->user, 'sanctum')
            ->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'livree'])->assertOk();

        $this->assertSame('2550.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_no_commission_is_booked_for_an_unpaid_order_forced_to_delivered(): void
    {
        [, $deliverer, $order] = $this->unpaidRoute();

        app(\App\Services\OrderStatusService::class)->transitionTo($order, Order::STATUS_LIVREE);

        $this->assertSame(0, Commission::count());
        $this->assertSame('0.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_cash_debt_is_netted_against_online_earnings_at_payout(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $client = $this->makeUser('client');
        $service = app(\App\Services\OrderStatusService::class);
        // 3 000 en ligne : +2 550 ; 3 000 en espèces : -450 ; net à verser : 2 100.
        $service->transitionTo($this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'en_ligne'), Order::STATUS_LIVREE);
        $service->transitionTo($this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'especes'), Order::STATUS_LIVREE);

        $this->mock(FedaPayService::class)->shouldReceive('createPayout')->once()->with('0146620583', 2100.0, \Mockery::any())->andReturn(['id' => 7]);

        (new ProcessScheduledPayouts)->handle(app(FedaPayService::class), app(AuditLogService::class));

        $this->assertSame('2100.00', Payout::first()->total_amount);
        $this->assertSame(0, Commission::where('status', '!=', 'paid')->count());
        $this->assertSame('0.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_nothing_is_paid_out_while_the_cash_debt_exceeds_earnings(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'especes');
        app(\App\Services\OrderStatusService::class)->transitionTo($order, Order::STATUS_LIVREE);

        $this->mock(FedaPayService::class)->shouldNotReceive('createPayout');

        (new ProcessScheduledPayouts)->handle(app(FedaPayService::class), app(AuditLogService::class));

        $this->assertSame(0, Payout::count());
        $this->assertSame('due', Commission::first()->status);
        $this->assertSame('-450.00', $deliverer->fresh()->wallet_balance);
    }
}
