<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\Transaction;
use App\Notifications\DeliveryConfirmed;
use App\Notifications\DeliveryHandedOver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Réception d'un colis : le livreur envoie la photo, l'EXPÉDITEUR confirme (le destinataire n'a pas l'application).
 * L'argent, payé à la création, reste bloqué chez LIV corp jusque-là, puis devient un solde pour le livreur.
 */
class DeliveryConfirmationTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function onTheWay(float $price = 2000): array
    {
        Storage::fake('parcel_photos');
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, $price);

        return [$client, $deliverer, $order];
    }

    private function handOver($deliverer, Order $order, bool $withPhoto = true)
    {
        return $this->actingAs($deliverer->user, 'sanctum')->post(
            "/api/v1/deliverer/orders/{$order->id}/deliver",
            $withPhoto ? ['delivery_photo' => UploadedFile::fake()->image('recu.jpg', 800, 600)] : [],
            ['Accept' => 'application/json'],
        );
    }

    public function test_handing_over_needs_a_reception_photo_and_waits_for_the_sender(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->onTheWay();

        $this->handOver($deliverer, $order, withPhoto: false)->assertUnprocessable()->assertJsonValidationErrors('delivery_photo');
        $this->assertSame('en_cours_livraison', $order->fresh()->status);

        $this->handOver($deliverer, $order)->assertOk()->assertJsonPath('order.status', 'remise');

        $order->refresh();
        $this->assertNotNull($order->delivery_photo_path);
        $this->assertNotNull($order->handed_over_at);
        // Rien n'est encore crédité au livreur : l'argent reste bloqué chez LIV corp.
        $this->assertSame(0, Commission::count());
        $this->assertSame('0.00', $deliverer->fresh()->wallet_balance);
        Notification::assertSentTo($client, DeliveryHandedOver::class);
    }

    public function test_the_sender_sees_the_photo_and_the_automatic_confirmation_time(): void
    {
        [$client, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")
            ->assertOk()->assertJsonPath('status', 'remise')
            ->assertJsonStructure(['delivery_photo_url', 'auto_confirm_at']);
    }

    public function test_the_deliverer_can_no_longer_mark_a_delivery_as_delivered_himself(): void
    {
        [, $deliverer, $order] = $this->onTheWay();

        $this->actingAs($deliverer->user, 'sanctum')->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'livree'])->assertUnprocessable();

        $this->assertSame('en_cours_livraison', $order->fresh()->status);
    }

    public function test_the_sender_confirms_and_the_held_money_becomes_the_deliverers_balance(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->onTheWay(2000);
        $this->handOver($deliverer, $order)->assertOk();

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/confirm-delivery")
            ->assertOk()->assertJsonPath('order.status', 'livree');

        $commission = Commission::first();
        $this->assertSame('300.00', $commission->commission_amount);   // 15 %
        $this->assertSame('1700.00', $commission->net_amount);
        $this->assertSame('1700.00', $deliverer->fresh()->wallet_balance);
        $this->assertSame(1, $deliverer->fresh()->total_deliveries);
        Notification::assertSentTo($deliverer->user, DeliveryConfirmed::class);

        // Une seule fois.
        $this->postJson("/api/v1/client/orders/{$order->id}/confirm-delivery")->assertUnprocessable();
        $this->assertSame(1, Commission::count());
    }

    public function test_only_the_sender_or_a_company_manager_can_confirm(): void
    {
        [$client, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();

        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/confirm-delivery")->assertForbidden();
        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/confirm-delivery")->assertForbidden();
        $this->assertSame('remise', $order->fresh()->status);
    }

    public function test_nothing_to_confirm_before_the_parcel_is_handed_over(): void
    {
        [$client, , $order] = $this->onTheWay();

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/confirm-delivery")->assertUnprocessable();
    }

    public function test_a_problem_blocks_the_money_and_opens_a_dispute(): void
    {
        [$client, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/report-problem", ['reason' => 'colis_non_livre', 'description' => 'Rien reçu à cette adresse.'])
            ->assertOk()->assertJsonPath('order.status', 'litige');

        $this->assertSame(1, Dispute::where('order_id', $order->id)->where('status', 'ouvert')->count());
        $this->assertSame(0, Commission::count());
        $this->postJson("/api/v1/client/orders/{$order->id}/report-problem", ['reason' => 'autre', 'description' => 'Encore un problème.'])->assertUnprocessable();
    }

    public function test_a_problem_needs_a_description(): void
    {
        [$client, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/report-problem", ['reason' => 'autre', 'description' => ''])->assertUnprocessable();
    }

    public function test_silence_confirms_the_reception_after_the_delay_but_not_before_nor_in_a_dispute(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();

        $this->travel(23)->hours();
        $this->artisan('orders:auto-confirm')->assertSuccessful();
        $this->assertSame('remise', $order->fresh()->status);

        $this->travel(2)->hours();
        $this->artisan('orders:auto-confirm')->assertSuccessful();

        $this->assertSame('livree', $order->fresh()->status);
        $this->assertSame('1700.00', $deliverer->fresh()->wallet_balance);
        Notification::assertSentTo($deliverer->user, DeliveryConfirmed::class, fn ($n) => $n->automatic === true);

        // Un colis contesté n'est jamais confirmé d'office.
        [$client2, $deliverer2, $order2] = $this->onTheWay();
        $this->handOver($deliverer2, $order2)->assertOk();
        $this->actingAs($client2, 'sanctum')->postJson("/api/v1/client/orders/{$order2->id}/report-problem", ['reason' => 'autre', 'description' => 'Colis abîmé.'])->assertOk();
        $this->travel(48)->hours();
        $this->artisan('orders:auto-confirm')->assertSuccessful();
        $this->assertSame('litige', $order2->fresh()->status);
    }

    public function test_the_automatic_confirmation_can_be_disabled(): void
    {
        [, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();
        config(['services.orders.auto_confirm_hours' => 0]);

        $this->travel(100)->hours();
        $this->artisan('orders:auto-confirm')->assertSuccessful();

        $this->assertSame('remise', $order->fresh()->status);
    }

    public function test_location_sharing_stops_once_the_parcel_is_handed_over(): void
    {
        [, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.36, 'lng' => 2.40])->assertUnprocessable();
    }

    // ------------------------------------------------------------ Litige : à qui va l'argent bloqué

    private function disputedOrder(): array
    {
        [$client, $deliverer, $order] = $this->onTheWay();
        $this->handOver($deliverer, $order)->assertOk();
        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/report-problem", ['reason' => 'colis_endommage', 'description' => 'Le colis est abîmé.'])->assertOk();

        return [$client, $deliverer, $order->fresh(), Dispute::first()];
    }

    public function test_the_admin_pays_the_deliverer_when_the_delivery_was_real(): void
    {
        [, $deliverer, $order, $dispute] = $this->disputedOrder();

        $this->actingAs($this->makeUser('admin'), 'sanctum')->postJson("/api/v1/admin/disputes/{$dispute->id}/resolve", ['resolution' => 'sans_suite'])
            ->assertOk()->assertJsonPath('refund.status', 'none');

        $this->assertSame('livree', $order->fresh()->status);
        $this->assertSame('1700.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_the_admin_refunds_the_client_and_the_deliverer_gets_nothing(): void
    {
        [$client, $deliverer, $order, $dispute] = $this->disputedOrder();
        $this->configureKkiapay();
        $transaction = Transaction::create(['order_id' => $order->id, 'user_id' => $client->id, 'provider' => 'kkiapay', 'reference' => 'LIVP-X', 'provider_transaction_id' => 'TXD', 'amount' => $order->price, 'method' => 'mobile_money', 'status' => 'approved']);
        $order->update(['transaction_id' => $transaction->id]);
        Http::fake(['*' => Http::response(['status' => 'SUCCESS'])]);

        $this->actingAs($this->makeUser('admin'), 'sanctum')->postJson("/api/v1/admin/disputes/{$dispute->id}/resolve", ['resolution' => 'remboursement_total'])
            ->assertOk()->assertJsonPath('refund.status', 'done');

        $this->assertSame('annulee', $order->fresh()->status);
        $this->assertSame('rembourse', $order->fresh()->payment_status);
        $this->assertSame(0, Commission::count());
        $this->assertSame('0.00', $deliverer->fresh()->wallet_balance);
    }

    public function test_a_partial_refund_pays_the_deliverer_and_leaves_the_partial_refund_to_do(): void
    {
        [$client, $deliverer, $order, $dispute] = $this->disputedOrder();
        $transaction = Transaction::create(['order_id' => $order->id, 'user_id' => $client->id, 'provider' => 'kkiapay', 'reference' => 'LIVP-Y', 'provider_transaction_id' => 'TXE', 'amount' => $order->price, 'method' => 'mobile_money', 'status' => 'approved']);
        $order->update(['transaction_id' => $transaction->id]);

        $this->actingAs($this->makeUser('admin'), 'sanctum')->postJson("/api/v1/admin/disputes/{$dispute->id}/resolve", ['resolution' => 'remboursement_partiel'])
            ->assertOk()->assertJsonPath('refund.status', 'manual');

        $this->assertSame('livree', $order->fresh()->status);
        $this->assertSame('manual', $transaction->fresh()->refund_status);
    }
}
