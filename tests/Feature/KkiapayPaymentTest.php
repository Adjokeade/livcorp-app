<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Order;
use App\Models\Payout;
use App\Models\Transaction;
use App\Notifications\NewOrderAvailable;
use App\Notifications\PayoutSent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Paiement en ligne KKiaPay À LA CRÉATION : la livraison est invisible tant qu'elle n'est pas payée, le serveur vérifie
 * chaque paiement auprès de KKiaPay, le webhook sert de filet, et les versements aux livreurs sont payés par l'administration.
 */
class KkiapayPaymentTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    /** Chaque appel remplace la réponse simulée (les simulations de Http::fake s'empilent sinon). */
    private function fakeApis(array $kkiapay = [], bool $osrm = true): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake([
            '*kkiapay.me*' => Http::response($kkiapay + ['status' => 'SUCCESS', 'amount' => 1880, 'partnerId' => null, 'source' => 'MOBILE_MONEY']),
            '*' => Http::response(['code' => 'Ok', 'routes' => [[
                'distance' => 9190, 'duration' => 600, 'geometry' => ['coordinates' => [[2.4183, 6.3654], [2.3620, 6.3520]]],
            ]]]),
        ]);
    }

    private function newOrder(array $overrides = []): array
    {
        return $overrides + [
            'type' => 'colis', 'pickup_address' => 'Dantokpa, Cotonou', 'pickup_lat' => 6.3654, 'pickup_lng' => 2.4183,
            'dropoff_address' => 'Fidjrossé, Cotonou', 'dropoff_lat' => 6.3520, 'dropoff_lng' => 2.3620,
            'recipient_name' => 'Koffi', 'recipient_phone' => '+22901000000',
            'photo' => UploadedFile::fake()->image('colis.jpg', 800, 600),
        ];
    }

    /** Crée une livraison comme le fait le client : renvoie [client, order, reference]. */
    private function create(): array
    {
        Storage::fake('parcel_photos');
        $this->configureKkiapay();
        $this->fakeApis();
        $client = $this->makeUser('client');

        $response = $this->actingAs($client, 'sanctum')->post('/api/v1/client/orders', $this->newOrder(), ['Accept' => 'application/json'])->assertCreated();

        return [$client, Order::findOrFail($response->json('order.id')), $response->json('payment.reference')];
    }

    public function test_a_new_delivery_is_unpaid_and_hidden_from_deliverers_until_paid(): void
    {
        Notification::fake();
        [$client, $order, $reference] = $this->create();
        $deliverer = $this->makeDeliverer();

        $this->assertSame('en_attente', $order->payment_status);
        $this->assertNull($order->delivery_code);
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(0, 'data');
        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(0, 'data');
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertStatus(409);
        Notification::assertNothingSent();
    }

    public function test_creation_returns_what_the_widget_needs_and_never_the_private_keys(): void
    {
        Storage::fake('parcel_photos');
        $this->configureKkiapay();
        $this->fakeApis();

        $response = $this->actingAs($this->makeUser('client'), 'sanctum')->post('/api/v1/client/orders', $this->newOrder(), ['Accept' => 'application/json'])->assertCreated();

        $response->assertJsonPath('payment.amount', 1880)->assertJsonPath('payment.public_key', 'pk')->assertJsonPath('payment.sandbox', true);
        $this->assertStringStartsWith('LIVP-', $response->json('payment.reference'));
        $this->assertStringNotContainsString('"sk"', $response->getContent());
        $this->assertSame(1, Transaction::count());
        $this->assertSame(Transaction::first()->id, Order::first()->transaction_id);
    }

    public function test_without_kkiapay_keys_nothing_is_created(): void
    {
        Storage::fake('parcel_photos');
        config(['services.kkiapay.public_key' => null]);
        $this->fakeApis();

        $this->actingAs($this->makeUser('client'), 'sanctum')->post('/api/v1/client/orders', $this->newOrder(), ['Accept' => 'application/json'])
            ->assertStatus(502);

        $this->assertSame(0, Order::count());
    }

    public function test_a_verified_payment_publishes_the_delivery_and_alerts_nearby_deliverers(): void
    {
        Notification::fake();
        [$client, $order, $reference] = $this->create();
        $near = $this->makeDeliverer();
        $near->update(['is_available' => true, 'current_lat' => 6.36, 'current_lng' => 2.40]);
        \App\Models\PushSubscription::create(['user_id' => $near->user_id, 'endpoint' => 'https://fcm.googleapis.com/x', 'endpoint_hash' => \App\Models\PushSubscription::hashEndpoint('https://fcm.googleapis.com/x'), 'public_key' => 'k', 'auth_token' => 'a']);
        $this->fakeApis(['partnerId' => $reference]);

        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $reference, 'transaction_id' => 'TX123'])
            ->assertOk()->assertJsonPath('status', 'approved');

        $this->assertSame('paye', $order->fresh()->payment_status);
        $this->assertSame('en_ligne', $order->fresh()->payment_method);
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(1, 'data');
        Notification::assertSentTo($near->user, NewOrderAvailable::class);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'api-sandbox.kkiapay.me/api/v1/transactions/status')
            && $r->hasHeader('X-PRIVATE-KEY', 'sk') && $r->hasHeader('X-SECRET-KEY', 'ss') && $r->hasHeader('X-API-KEY', 'pk'));
    }

    public function test_the_browser_is_never_believed_on_its_word(): void
    {
        [, $order, $reference] = $this->create();

        // Montant différent : le client a payé 100 F et prétend avoir payé le prix de la livraison.
        $this->fakeApis(['amount' => 100, 'partnerId' => $reference]);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $reference, 'transaction_id' => 'TX1'])->assertUnprocessable();

        // Paiement fait pour une autre référence.
        $this->fakeApis(['partnerId' => 'LIVP-AUTRE']);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $reference, 'transaction_id' => 'TX2'])->assertUnprocessable();

        $this->assertFalse($order->fresh()->isPaid());
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(0, 'data');
    }

    public function test_pending_failed_and_unreachable_kkiapay_never_publish_the_delivery(): void
    {
        [, $order, $reference] = $this->create();
        $payload = ['reference' => $reference, 'transaction_id' => 'TX9'];

        $this->fakeApis(['status' => 'PENDING', 'partnerId' => $reference]);
        $this->postJson('/api/v1/client/payments/confirm', $payload)->assertOk()->assertJsonPath('status', 'pending');

        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake(['*' => Http::response('', 500)]);
        $this->postJson('/api/v1/client/payments/confirm', $payload)->assertStatus(202);
        $this->assertFalse($order->fresh()->isPaid());

        $this->fakeApis(['status' => 'FAILED', 'partnerId' => $reference]);
        $this->postJson('/api/v1/client/payments/confirm', $payload)->assertOk()->assertJsonPath('status', 'failed');
        $this->assertSame('echoue', $order->fresh()->payment_status);
    }

    public function test_a_failed_payment_can_be_retried_on_the_same_delivery(): void
    {
        [$client, $order, $reference] = $this->create();
        $this->fakeApis(['status' => 'FAILED', 'partnerId' => $reference]);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $reference, 'transaction_id' => 'TX9'])->assertOk();

        $retry = $this->postJson("/api/v1/client/orders/{$order->id}/payment")->assertOk()->json('payment.reference');

        $this->assertNotSame($reference, $retry);
        $this->fakeApis(['partnerId' => $retry]);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $retry, 'transaction_id' => 'TX10'])->assertOk()->assertJsonPath('status', 'approved');
        $this->assertSame('paye', $order->fresh()->payment_status);
    }

    public function test_a_kkiapay_transaction_cannot_pay_twice_and_only_the_payer_can_confirm(): void
    {
        [$client, $order, $reference] = $this->create();
        $this->fakeApis(['partnerId' => $reference]);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $reference, 'transaction_id' => 'TX123'])->assertOk();

        // Une deuxième livraison essaie de réutiliser le même identifiant KKiaPay.
        $this->fakeApis();
        $second = $this->post('/api/v1/client/orders', $this->newOrder(), ['Accept' => 'application/json'])->assertCreated()->json('payment.reference');
        $this->fakeApis(['partnerId' => $second]);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $second, 'transaction_id' => 'TX123'])->assertUnprocessable()->assertJsonValidationErrors('transaction_id');

        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson('/api/v1/client/payments/confirm', ['reference' => $second, 'transaction_id' => 'TXZ'])->assertForbidden();
    }

    public function test_the_webhook_needs_the_secret_and_re_verifies_with_kkiapay(): void
    {
        [, $order, $reference] = $this->create();
        $body = ['transactionId' => 'TXW', 'partnerId' => $reference, 'isPaymentSucces' => true, 'event' => 'transaction.success'];

        $this->postJson('/api/v1/webhooks/kkiapay', $body)->assertUnauthorized();
        $this->postJson('/api/v1/webhooks/kkiapay', $body, ['x-kkiapay-secret' => 'mauvais'])->assertUnauthorized();

        // Un webhook falsifié ne suffit pas : KKiaPay dit que ce n'est pas réussi.
        $this->fakeApis(['status' => 'FAILED', 'partnerId' => $reference]);
        $this->postJson('/api/v1/webhooks/kkiapay', $body, ['x-kkiapay-secret' => 'hash-secret'])->assertOk();
        $this->assertFalse($order->fresh()->isPaid());
    }

    public function test_the_webhook_settles_once_even_if_kkiapay_retries(): void
    {
        Notification::fake();
        [, $order, $reference] = $this->create();
        $this->fakeApis(['partnerId' => $reference]);
        $body = ['transactionId' => 'TXW', 'partnerId' => $reference, 'isPaymentSucces' => true, 'event' => 'transaction.success'];

        $this->postJson('/api/v1/webhooks/kkiapay', $body, ['x-kkiapay-secret' => 'hash-secret'])->assertOk();
        $this->postJson('/api/v1/webhooks/kkiapay', $body, ['x-kkiapay-secret' => 'hash-secret'])->assertOk();

        $this->assertSame('paye', $order->fresh()->payment_status);
        $this->postJson('/api/v1/webhooks/kkiapay', ['transactionId' => 'X', 'partnerId' => 'LIVP-INCONNU'], ['x-kkiapay-secret' => 'hash-secret'])->assertOk();
    }

    public function test_unpaid_deliveries_expire_and_paid_ones_do_not(): void
    {
        [, $unpaid] = $this->create();
        $paid = $this->makeOrder($this->makeUser('client'), null, Order::STATUS_CREEE);
        Order::query()->update(['created_at' => now()->subMinutes(45)]);

        $this->artisan('orders:expire-unpaid')->assertSuccessful();

        $this->assertSame('annulee', $unpaid->fresh()->status);
        $this->assertSame('cancelled', Transaction::first()->status);
        $this->assertSame('creee', $paid->fresh()->status);
    }

    // ---------------------------------------------------------- Annulation : l'argent bloqué est rendu

    private function paidOrder(string $method = 'mobile_money'): array
    {
        [$client, $order, $reference] = $this->create();
        $this->fakeApis(['partnerId' => $reference, 'source' => $method === 'carte' ? 'CARD' : 'MOBILE_MONEY']);
        $this->postJson('/api/v1/client/payments/confirm', ['reference' => $reference, 'transaction_id' => 'TXP'])->assertOk();

        return [$client, $order->fresh()];
    }

    public function test_cancelling_a_paid_delivery_refunds_the_client_through_kkiapay(): void
    {
        [$client, $order] = $this->paidOrder();
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake(['*' => Http::response(['status' => 'SUCCESS'])]);

        $this->postJson("/api/v1/client/orders/{$order->id}/cancel")->assertOk()->assertJsonPath('refund.status', 'done');

        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/v1/transactions/revert') && $r['transactionId'] === 'TXP');
        $this->assertSame('rembourse', $order->fresh()->payment_status);
        $this->assertSame('refunded', Transaction::first()->status);
    }

    public function test_a_card_payment_or_an_api_failure_leaves_a_manual_refund_for_the_admin(): void
    {
        [$client, $order] = $this->paidOrder('carte');
        $this->postJson("/api/v1/client/orders/{$order->id}/cancel")->assertOk()->assertJsonPath('refund.status', 'manual');

        $this->assertSame('manual', Transaction::first()->refund_status);
        $admin = $this->makeUser('admin');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/finance/refunds')->assertOk()->assertJsonCount(1);
        $this->postJson('/api/v1/admin/finance/refunds/'.Transaction::first()->id.'/done')->assertOk();
        $this->assertSame('done', Transaction::first()->refund_status);
        $this->getJson('/api/v1/admin/finance/refunds')->assertJsonCount(0);
    }

    // ---------------------------------------------------------- Versements payés par l'administration

    private function pendingPayout(): array
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['mobile_money_number' => '0146620583']);
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 2000);
        $this->completeDelivery($order);
        (new \App\Jobs\ProcessScheduledPayouts)->handle(app(\App\Services\AuditLogService::class));

        return [$deliverer, Payout::first()];
    }

    public function test_the_admin_marks_a_payout_as_paid_which_settles_commissions_and_alerts_the_deliverer(): void
    {
        Notification::fake();
        [$deliverer, $payout] = $this->pendingPayout();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/finance/payouts/{$payout->id}/pay", ['reference' => 'MTN-998877'])->assertOk();

        $payout->refresh();
        $this->assertSame('paid', $payout->status);
        $this->assertSame('MTN-998877', $payout->reference);
        $this->assertSame($admin->id, $payout->paid_by);
        $this->assertSame('paid', Commission::first()->status);
        $this->assertSame('0.00', $deliverer->fresh()->wallet_balance);
        Notification::assertSentTo($deliverer->user, PayoutSent::class);
        $this->postJson("/api/v1/admin/finance/payouts/{$payout->id}/pay")->assertUnprocessable();
    }

    public function test_a_cancelled_payout_returns_its_commissions_to_the_queue(): void
    {
        [, $payout] = $this->pendingPayout();

        $this->actingAs($this->makeUser('admin'), 'sanctum')->postJson("/api/v1/admin/finance/payouts/{$payout->id}/cancel")->assertOk();

        $this->assertSame('failed', $payout->fresh()->status);
        $this->assertSame('due', Commission::first()->status);
        $this->assertNull(Commission::first()->payout_id);
        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson("/api/v1/admin/finance/payouts/{$payout->id}/pay")->assertForbidden();
    }
}
