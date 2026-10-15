<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Transaction;
use App\Notifications\CashCollected;
use App\Notifications\NewOrderAvailable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Paiement en espèces : l'expéditeur remet le prix au livreur AU RETRAIT du colis, le livreur le confirme avant de partir.
 * Il détient alors l'argent et doit sa commission à LIV corp (déduite de ses prochains versements).
 */
class CashPaymentTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function cashPayload(array $overrides = []): array
    {
        return $overrides + [
            'type' => 'colis', 'payment_method' => 'especes',
            'pickup_address' => 'Dantokpa', 'pickup_lat' => 6.3654, 'pickup_lng' => 2.4183,
            'dropoff_address' => 'Fidjrossé', 'dropoff_lat' => 6.3520, 'dropoff_lng' => 2.3620,
            'recipient_name' => 'Koffi', 'recipient_phone' => '+22901000000',
            'photo' => UploadedFile::fake()->image('c.jpg', 800, 600),
        ];
    }

    private function fakeRoute(): void
    {
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [['distance' => 9190, 'duration' => 600, 'geometry' => ['coordinates' => [[2.41, 6.36], [2.36, 6.35]]]]]])]);
    }

    private function cashOrder(string $status = Order::STATUS_ACCEPTEE, float $price = 2000): array
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, $status, $price, 'especes');
        $order->update(['payment_status' => 'en_attente', 'payment_method' => 'especes']);

        return [$client, $deliverer, $order];
    }

    public function test_a_cash_delivery_is_created_and_published_without_any_online_payment(): void
    {
        Notification::fake();
        Storage::fake('parcel_photos');
        $this->fakeRoute();
        // Aucune clé KKiaPay : les espèces fonctionnent quand même.
        config(['services.kkiapay.public_key' => null]);
        $near = $this->makeDeliverer();
        $near->update(['is_available' => true, 'current_lat' => 6.37, 'current_lng' => 2.40]);
        \App\Models\PushSubscription::create(['user_id' => $near->user_id, 'endpoint' => 'https://fcm.googleapis.com/c', 'endpoint_hash' => \App\Models\PushSubscription::hashEndpoint('https://fcm.googleapis.com/c'), 'public_key' => 'k', 'auth_token' => 'a']);

        $response = $this->actingAs($this->makeUser('client'), 'sanctum')->post('/api/v1/client/orders', $this->cashPayload(), ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('order.payment_method', 'especes')->assertJsonPath('order.awaiting_payment', false);

        $this->assertArrayNotHasKey('payment', $response->json());
        $this->assertSame(0, Transaction::count());
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(1, 'data')->assertJsonPath('data.0.payment_method', 'especes');
        Notification::assertSentTo($near->user, NewOrderAvailable::class);
    }

    public function test_a_cash_delivery_never_expires_for_lack_of_payment(): void
    {
        [, , $order] = $this->cashOrder(Order::STATUS_CREEE);
        $order->update(['deliverer_id' => null, 'created_at' => now()->subHours(3)]);

        $this->artisan('orders:expire-unpaid')->assertSuccessful();

        $this->assertSame('creee', $order->fresh()->status);
    }

    public function test_the_deliverer_cannot_pick_up_the_parcel_before_collecting_the_cash(): void
    {
        [, $deliverer, $order] = $this->cashOrder();
        $this->actingAs($deliverer->user, 'sanctum');

        $this->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'colis_recupere'])
            ->assertUnprocessable()->assertJsonPath('message', fn ($m) => str_contains($m, 'Encaissez d\'abord 2 000 FCFA'));
        $this->assertSame('acceptee', $order->fresh()->status);

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/cash-collected")->assertOk()->assertJsonPath('order.payment_status', 'paye');
        $this->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'colis_recupere'])->assertOk();
    }

    public function test_collecting_cash_informs_the_sender_and_is_idempotent(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->cashOrder();
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/cash-collected")->assertOk();
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/cash-collected")->assertOk();

        Notification::assertSentToTimes($client, CashCollected::class, 1);
    }

    public function test_cash_cannot_be_collected_on_an_online_order_nor_at_the_wrong_stage_nor_by_someone_else(): void
    {
        [, $deliverer, $order] = $this->cashOrder();
        $online = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_ACCEPTEE, 1500, 'en_ligne');
        $onTheWay = $this->cashOrder(Order::STATUS_EN_COURS_LIVRAISON)[2];

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$online->id}/cash-collected")->assertUnprocessable();
        $this->actingAs($onTheWay->deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$onTheWay->id}/cash-collected")->assertUnprocessable();
        $this->actingAs($this->makeDeliverer()->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/cash-collected")->assertForbidden();
    }

    public function test_the_sender_may_cancel_before_the_cash_is_collected_but_not_after(): void
    {
        [$client, $deliverer, $order] = $this->cashOrder();
        [$client2, $deliverer2, $order2] = $this->cashOrder();
        $this->actingAs($deliverer2->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order2->id}/cash-collected")->assertOk();

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/cancel")->assertOk()->assertJsonPath('refund.status', 'none');
        $this->actingAs($client2, 'sanctum')->postJson("/api/v1/client/orders/{$order2->id}/cancel")->assertUnprocessable();
        $this->assertSame('acceptee', $order2->fresh()->status);
    }

    public function test_at_confirmation_the_deliverer_who_holds_the_cash_owes_the_commission(): void
    {
        [, $deliverer, $order] = $this->cashOrder(Order::STATUS_EN_COURS_LIVRAISON, 3000);
        $order->update(['payment_status' => 'paye']);

        $this->completeDelivery($order);

        $commission = Commission::first();
        $this->assertSame('450.00', $commission->commission_amount);
        $this->assertSame('-450.00', $commission->net_amount);
        $this->assertSame('-450.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_the_cash_commission_is_netted_against_online_earnings_at_payout(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $client = $this->makeUser('client');
        // 3 000 en ligne : +2 550 ; 3 000 en espèces : −450 ; net à verser : 2 100.
        $this->completeDelivery($this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'en_ligne'));
        $this->completeDelivery($this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'especes'));

        (new \App\Jobs\ProcessScheduledPayouts)->handle(app(\App\Services\AuditLogService::class));

        $this->assertSame('2100.00', Payout::first()->total_amount);
        $this->assertSame(0, Commission::where('status', '!=', 'included_in_payout')->count());
    }

    public function test_nothing_is_prepared_while_the_cash_debt_exceeds_the_earnings(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $this->completeDelivery($this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'especes'));

        (new \App\Jobs\ProcessScheduledPayouts)->handle(app(\App\Services\AuditLogService::class));

        $this->assertSame(0, Payout::count());
        $this->assertSame('due', Commission::first()->status);
        $this->assertSame('-450.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_a_cash_batch_is_created_and_published_without_payment(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeRoute();
        $owner = $this->makeUser('client');
        $owner->update(['account_type' => 'entreprise', 'company_name' => 'ACME']);
        $row = fn () => ['type' => 'colis', 'dropoff_address' => 'Fidjrossé', 'dropoff_lat' => 6.3520, 'dropoff_lng' => 2.3620, 'recipient_name' => 'K', 'recipient_phone' => '+22901000000', 'photo' => UploadedFile::fake()->image('c.jpg')];

        $response = $this->actingAs($owner, 'sanctum')->post('/api/v1/client/orders/batch', [
            'pickup_address' => 'Dantokpa', 'pickup_lat' => 6.3654, 'pickup_lng' => 2.4183, 'payment_method' => 'especes', 'orders' => [$row(), $row()],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonCount(2, 'orders');

        $this->assertArrayNotHasKey('payment', $response->json());
        $this->assertSame(2, Order::where('payment_method', 'especes')->count());
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(2, 'data');
    }

    public function test_stats_do_not_count_cash_deliveries_as_waiting_for_payment(): void
    {
        [$client] = $this->cashOrder(Order::STATUS_CREEE);
        $this->makeOrder($client, null, Order::STATUS_CREEE, 1500)->update(['payment_status' => 'en_attente', 'payment_method' => null]);

        $this->actingAs($client, 'sanctum')->getJson('/api/v1/client/stats')->assertOk()->assertJsonPath('to_pay', 1);
    }
}
