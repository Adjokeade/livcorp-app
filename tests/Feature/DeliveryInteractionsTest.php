<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderRelease;
use App\Models\PriceOffer;
use App\Models\TrackingPoint;
use App\Notifications\DelivererArrived;
use App\Notifications\DeliveryCodeLocked;
use App\Notifications\DeliveryCodeReminder;
use App\Notifications\DeliveryRetryRequested;
use App\Notifications\NewChatMessage;
use App\Notifications\NewOrderAvailable;
use App\Notifications\OrderStatusUpdatedForClient;
use App\Notifications\RecipientUnreachable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Lot 1 des interactions client / livreur : contacts protégés, messagerie, arrivée, code de remise,
 * preuve photo, désistement, destinataire injoignable.
 */
class DeliveryInteractionsTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private const PICKUP = [6.3727, 2.4335];
    private const DROPOFF = [6.3525, 2.3675];

    /** @return array{0: \App\Models\User, 1: \App\Models\Deliverer, 2: Order} */
    private function course(string $status, array $overrides = []): array
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, $status, 3000, 'en_ligne', $overrides + [
            'pickup_lat' => self::PICKUP[0], 'pickup_lng' => self::PICKUP[1],
            'dropoff_lat' => self::DROPOFF[0], 'dropoff_lng' => self::DROPOFF[1],
            'delivery_code' => '4821',
            'initial_price' => 3000,
        ]);

        return [$client, $deliverer, $order];
    }

    private function position(Order $order, array $at, ?Carbon $when = null): void
    {
        TrackingPoint::create(['order_id' => $order->id, 'deliverer_id' => $order->deliverer_id, 'lat' => $at[0], 'lng' => $at[1], 'recorded_at' => $when ?? now()]);
    }

    // ================================================================ Contacts protégés

    public function test_the_client_sees_what_identifies_the_deliverer_but_no_private_data(): void
    {
        [$client, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $deliverer->update(['wallet_balance' => 12345, 'mobile_money_number' => '0146620583', 'emergency_phone' => '+22901999999', 'vehicle_plate' => 'AB 1234 RB']);

        $response = $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertOk();
        $raw = $response->getContent();

        $response->assertJsonPath('deliverer.user.first_name', $deliverer->user->first_name)
            ->assertJsonPath('deliverer.vehicle_plate', 'AB 1234 RB');
        foreach (['12345', '0146620583', '01999999', $deliverer->user->email, 'wallet_balance', 'mobile_money_number', 'emergency_phone'] as $secret) {
            $this->assertStringNotContainsString($secret, $raw, "fuite : {$secret}");
        }
    }

    public function test_the_deliverer_phone_is_shown_during_the_course_only(): void
    {
        [$client, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")
            ->assertJsonPath('deliverer.user.phone', $deliverer->user->phone);

        $order->update(['status' => Order::STATUS_LIVREE]);
        $response = $this->getJson("/api/v1/client/orders/{$order->id}")->assertOk();
        $this->assertStringNotContainsString($deliverer->user->phone, $response->getContent());
    }

    public function test_the_client_list_does_not_leak_deliverer_data_either(): void
    {
        [$client, $deliverer] = $this->course(Order::STATUS_ACCEPTEE);
        $deliverer->update(['wallet_balance' => 777, 'mobile_money_number' => '0100000000']);

        $raw = $this->actingAs($client, 'sanctum')->getJson('/api/v1/client/orders')->assertOk()->getContent();

        $this->assertStringNotContainsString('wallet_balance', $raw);
        $this->assertStringNotContainsString('0100000000', $raw);
        $this->assertStringNotContainsString($deliverer->user->email, $raw);
    }

    public function test_the_deliverer_never_sees_the_delivery_code_nor_the_clients_email(): void
    {
        [$client, $deliverer] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);

        $raw = $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/orders/mine')->assertOk()->getContent();

        $this->assertStringNotContainsString('4821', $raw);
        $this->assertStringNotContainsString('delivery_code', $raw);
        $this->assertStringNotContainsString($client->email, $raw);
    }

    public function test_only_the_owner_sees_the_code_and_only_while_the_delivery_is_pending(): void
    {
        [$client, , $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertJsonPath('delivery_code', '4821');

        $order->update(['status' => Order::STATUS_LIVREE]);
        $this->getJson("/api/v1/client/orders/{$order->id}")->assertJsonMissingPath('delivery_code');
    }

    public function test_the_code_is_stored_encrypted_and_generated_at_creation(): void
    {
        [, , $order] = $this->course(Order::STATUS_ACCEPTEE);

        $this->assertNotSame('4821', DB::table('orders')->where('id', $order->id)->value('delivery_code'));
        $this->assertSame('4821', $order->fresh()->delivery_code);
    }

    public function test_recipient_phone_disappears_from_the_deliverers_list_once_the_order_is_over(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON, ['recipient_phone' => '+22901970000']);
        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/orders/mine')->assertJsonPath('data.0.recipient_phone', '+22901970000');

        $order->update(['status' => Order::STATUS_LIVREE]);
        $this->getJson('/api/v1/deliverer/orders/mine')->assertJsonMissingPath('data.0.recipient_phone');
    }

    // ================================================================ Messagerie

    public function test_client_and_deliverer_talk_and_unread_counters_follow(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Je suis devant le portail'])->assertCreated();
        Notification::assertSentTo($client, NewChatMessage::class);

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertJsonPath('unread_messages_count', 1);

        $this->getJson("/api/v1/orders/{$order->id}/messages?open=1")
            ->assertOk()
            ->assertJsonPath('data.0.body', 'Je suis devant le portail')
            ->assertJsonPath('data.0.mine', false)
            ->assertJsonPath('writable', true);
        $this->getJson("/api/v1/client/orders/{$order->id}")->assertJsonPath('unread_messages_count', 0);

        $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'J\'arrive'])->assertCreated();
        Notification::assertSentTo($deliverer->user, NewChatMessage::class);
        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/orders/mine')->assertJsonPath('data.0.unread_messages_count', 1);
    }

    public function test_polling_returns_only_new_messages(): void
    {
        [$client, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->actingAs($client, 'sanctum');
        $first = $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Un'])->json('message.id');
        $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Deux']);

        $this->getJson("/api/v1/orders/{$order->id}/messages?after={$first}")->assertJsonCount(1, 'data')->assertJsonPath('data.0.body', 'Deux');
    }

    public function test_strangers_cannot_read_or_write(): void
    {
        [, , $order] = $this->course(Order::STATUS_ACCEPTEE);

        foreach ([$this->makeUser('client'), $this->makeDeliverer()->user, $this->makeUser('admin')] as $stranger) {
            $this->actingAs($stranger, 'sanctum')->getJson("/api/v1/orders/{$order->id}/messages")->assertForbidden();
            $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Bonjour'])->assertForbidden();
        }
    }

    public function test_the_conversation_is_read_only_once_the_course_is_over(): void
    {
        [$client, , $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->actingAs($client, 'sanctum')->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Merci'])->assertCreated();

        $order->update(['status' => Order::STATUS_LIVREE]);

        $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Encore'])->assertUnprocessable();
        $this->getJson("/api/v1/orders/{$order->id}/messages")->assertOk()->assertJsonPath('writable', false)->assertJsonCount(1, 'data');
    }

    public function test_messages_are_validated(): void
    {
        [$client, , $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->actingAs($client, 'sanctum');

        $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => ''])->assertJsonValidationErrors('body');
        $this->postJson("/api/v1/orders/{$order->id}/messages", ['body' => str_repeat('a', 501)])->assertJsonValidationErrors('body');
    }

    // ================================================================ Arrivée

    public function test_the_deliverer_signals_his_arrival_and_the_client_is_told(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->position($order, [self::PICKUP[0] + 0.001, self::PICKUP[1]]); // ~110 m

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'pickup'])
            ->assertOk()
            ->assertJsonPath('order.status', 'acceptee');

        $this->assertNotNull($order->fresh()->pickup_arrived_at);
        Notification::assertSentTo($client, DelivererArrived::class, fn ($n) => $n->point === 'pickup');
    }

    public function test_arrival_is_refused_when_the_position_says_he_is_far(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->position($order, [self::PICKUP[0] + 0.02, self::PICKUP[1]]); // ~2,2 km

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'pickup'])
            ->assertUnprocessable()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Rapprochez-vous'));

        $this->assertNull($order->fresh()->pickup_arrived_at);
    }

    public function test_arrival_is_accepted_when_no_recent_position_exists(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->position($order, [self::PICKUP[0] + 0.02, self::PICKUP[1]], now()->subMinutes(10)); // vieille position : ignorée

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'pickup'])->assertOk();
    }

    public function test_arrival_points_match_the_stage_of_the_course(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'dropoff'])->assertUnprocessable();
        $order->update(['status' => Order::STATUS_EN_COURS_LIVRAISON]);
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'pickup'])->assertUnprocessable();
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'dropoff'])->assertOk();
        $this->assertNotNull($order->fresh()->dropoff_arrived_at);
    }

    public function test_signalling_arrival_twice_keeps_the_first_time(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'pickup'])->assertOk();
        $first = $order->fresh()->pickup_arrived_at;

        $this->travel(5)->minutes();
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/arrived", ['point' => 'pickup'])->assertOk();

        $this->assertEquals($first, $order->fresh()->pickup_arrived_at);
    }

    // ================================================================ Remise : code et photo

    private function payOnline(Order $order): void
    {
        $order->update(['payment_status' => 'paye', 'payment_method' => 'en_ligne']);
    }

    public function test_the_right_code_completes_the_delivery_and_books_the_commission(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->payOnline($order);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '4821'])
            ->assertOk()
            ->assertJsonPath('order.status', 'livree');

        $this->assertNotNull($order->fresh()->delivered_at);
        $this->assertSame(1, Commission::count());
    }

    public function test_a_wrong_code_is_refused_with_the_remaining_attempts(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->payOnline($order);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '0000'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Code incorrect. Il vous reste 4 essais.');

        $this->assertSame(Order::STATUS_EN_COURS_LIVRAISON, $order->fresh()->status);
    }

    public function test_five_wrong_codes_lock_the_delivery_and_warn_the_client_then_it_reopens(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->payOnline($order);
        $this->actingAs($deliverer->user, 'sanctum');

        foreach (range(1, 4) as $i) {
            $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '0000'])->assertUnprocessable();
        }
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '0000'])->assertStatus(429);
        Notification::assertSentTo($client, DeliveryCodeLocked::class);

        // Bloqué même avec le bon code.
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '4821'])->assertStatus(429);

        // La minute passe : la remise se rouvre.
        $this->travel(16)->minutes();
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '4821'])->assertOk();
    }

    public function test_the_code_is_required_and_the_payment_must_be_validated(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON, ['payment_status' => 'en_attente', 'payment_method' => null]);
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '4821'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Le paiement n\'est pas encore validé par le client.');

        $this->payOnline($order);
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", [])->assertUnprocessable()->assertJsonValidationErrors('delivery_code');
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '12'])->assertUnprocessable();
    }

    public function test_a_cash_payment_requires_a_delivery_photo_which_the_client_can_see(): void
    {
        Storage::fake('parcel_photos');
        [$client, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $order->update(['payment_status' => 'paye', 'payment_method' => 'especes']);
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '4821'])->assertJsonValidationErrors('delivery_photo');

        $this->post("/api/v1/deliverer/orders/{$order->id}/deliver", [
            'delivery_code' => '4821',
            'delivery_photo' => UploadedFile::fake()->image('remise.jpg', 1200, 900),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('order.status', 'livree');

        Storage::disk('parcel_photos')->assertExists($order->fresh()->delivery_photo_path);

        $url = $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->json('delivery_photo_url');
        $this->assertNotNull($url);
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $this->get("/api/v1/orders/{$order->id}/delivery-photo")->assertForbidden(); // sans signature
    }

    public function test_the_photo_is_optional_for_an_online_payment(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->payOnline($order);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/deliver", ['delivery_code' => '4821'])->assertOk();
    }

    public function test_the_plain_status_button_can_no_longer_complete_a_coded_delivery(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->payOnline($order);

        $this->actingAs($deliverer->user, 'sanctum')->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'livree'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Saisissez le code de remise donné par le destinataire.');
    }

    public function test_an_older_order_without_a_code_still_completes_the_old_way(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON, ['delivery_code' => null]);
        $this->payOnline($order);

        $this->actingAs($deliverer->user, 'sanctum')->patchJson("/api/v1/deliverer/orders/{$order->id}/status", ['status' => 'livree'])->assertOk();
    }

    public function test_the_deliverer_can_ask_the_client_to_find_the_code_but_not_endlessly(): void
    {
        Notification::fake();
        RateLimiter::clear('code-reminder:1');
        [$client, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        RateLimiter::clear("code-reminder:{$order->id}");
        $this->actingAs($deliverer->user, 'sanctum');

        foreach (range(1, 3) as $i) {
            $this->postJson("/api/v1/deliverer/orders/{$order->id}/remind-code")->assertOk();
        }
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/remind-code")->assertStatus(429);
        Notification::assertSentToTimes($client, DeliveryCodeReminder::class, 3);
    }

    // ================================================================ Désistement

    public function test_the_deliverer_releases_the_course_which_goes_back_to_the_market_at_the_clients_price(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE, ['price' => 4000, 'initial_price' => 3000, 'accepted_at' => now(), 'pickup_arrived_at' => now()]);
        $nearby = $this->makeDeliverer();
        $nearby->update(['is_available' => true]);
        $this->subscribe($nearby->user);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'panne'])
            ->assertOk()
            ->assertJsonPath('order.status', 'creee');

        $order->refresh();
        $this->assertNull($order->deliverer_id);
        $this->assertNull($order->accepted_at);
        $this->assertNull($order->pickup_arrived_at);
        $this->assertSame('3000.00', $order->price);      // prix négocié avec ce livreur : oublié
        $this->assertSame(1, OrderRelease::count());
        $this->assertStringStartsWith('Désistement du livreur : Panne', $order->statusHistory()->latest('id')->first()->note);
        Notification::assertSentTo($client, OrderStatusUpdatedForClient::class);
        Notification::assertSentTo($nearby->user, NewOrderAvailable::class);
        Notification::assertNotSentTo($deliverer->user, NewOrderAvailable::class);
    }

    private function subscribe($user): void
    {
        \App\Models\PushSubscription::create([
            'user_id' => $user->id, 'endpoint' => 'https://fcm.googleapis.com/fcm/send/'.$user->id,
            'endpoint_hash' => \App\Models\PushSubscription::hashEndpoint('https://fcm.googleapis.com/fcm/send/'.$user->id),
            'public_key' => 'k', 'auth_token' => 'a',
        ]);
    }

    public function test_a_deliverer_who_released_cannot_take_or_bid_on_the_course_again(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'trop_loin'])->assertOk();

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertStatus(409);
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/offer", ['amount' => 4000])->assertStatus(409);
        $this->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(0, 'data');

        // Un autre livreur, lui, la voit et peut la prendre.
        $this->actingAs($this->makeDeliverer()->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(1, 'data');
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertOk();
    }

    public function test_the_next_deliverer_does_not_read_the_previous_conversation(): void
    {
        [$client, $first, $order] = $this->course(Order::STATUS_ACCEPTEE);
        $this->actingAs($first->user, 'sanctum')->postJson("/api/v1/orders/{$order->id}/messages", ['body' => 'Je pars'])->assertCreated();
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'autre'])->assertOk();

        $second = $this->makeDeliverer();
        $this->actingAs($second->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertOk();

        $this->getJson("/api/v1/orders/{$order->id}/messages")->assertJsonCount(0, 'data');
        $this->actingAs($client, 'sanctum')->getJson("/api/v1/orders/{$order->id}/messages")->assertJsonCount(0, 'data');
    }

    public function test_a_release_is_refused_after_pickup_and_needs_a_valid_reason(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_COLIS_RECUPERE);
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'panne'])->assertUnprocessable();
        $order->update(['status' => Order::STATUS_ACCEPTEE]);
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'nimporte'])->assertJsonValidationErrors('reason');
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/release", [])->assertJsonValidationErrors('reason');
    }

    public function test_only_the_assigned_deliverer_can_release(): void
    {
        [, , $order] = $this->course(Order::STATUS_ACCEPTEE);

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'panne'])->assertForbidden();
    }

    public function test_the_deliverers_pending_offers_are_withdrawn_when_he_releases(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_ACCEPTEE);
        PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $deliverer->id, 'amount' => 3500]);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/release", ['reason' => 'panne'])->assertOk();

        $this->assertSame('withdrawn', PriceOffer::first()->status);
    }

    // ================================================================ Destinataire injoignable

    public function test_unreachable_needs_an_arrival_and_a_minimum_wait(): void
    {
        [, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/unreachable")->assertUnprocessable();

        $order->update(['dropoff_arrived_at' => now()->subMinutes(4)]);
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/unreachable")
            ->assertUnprocessable()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Patientez encore 6 min'));
    }

    public function test_an_unreachable_recipient_opens_a_dispute_and_the_client_can_ask_for_another_attempt(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON, ['dropoff_arrived_at' => now()->subMinutes(12)]);

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/unreachable")
            ->assertOk()
            ->assertJsonPath('order.status', 'litige');

        $this->assertNotNull($order->fresh()->failed_delivery_at);
        $dispute = Dispute::first();
        $this->assertSame('colis_non_livre', $dispute->reason);
        $this->assertSame('ouvert', $dispute->status);
        $this->assertSame($deliverer->user_id, $dispute->raised_by);
        Notification::assertSentTo($client, RecipientUnreachable::class);

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/retry-delivery")
            ->assertOk()
            ->assertJsonPath('order.status', 'en_cours_livraison')
            ->assertJsonPath('order.delivery_code', '4821');

        $order->refresh();
        $this->assertNull($order->failed_delivery_at);
        $this->assertNull($order->dropoff_arrived_at); // l'attente repart de zéro
        $this->assertSame('resolu', $dispute->fresh()->status);
        Notification::assertSentTo($deliverer->user, DeliveryRetryRequested::class);
    }

    public function test_the_client_cannot_ask_for_endless_attempts(): void
    {
        [$client, $deliverer, $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);

        foreach ([1, 2] as $attempt) {
            Order::whereKey($order->id)->update(['status' => Order::STATUS_EN_COURS_LIVRAISON, 'dropoff_arrived_at' => now()->subMinutes(12)]);
            $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/unreachable")->assertOk();
            $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/retry-delivery")->assertOk();
        }

        Order::whereKey($order->id)->update(['status' => Order::STATUS_EN_COURS_LIVRAISON, 'dropoff_arrived_at' => now()->subMinutes(12)]);
        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/unreachable")->assertOk();
        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/retry-delivery")
            ->assertUnprocessable()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'notre équipe va vous contacter'));
    }

    public function test_only_the_owner_can_retry_and_only_after_a_failed_delivery(): void
    {
        [$client, , $order] = $this->course(Order::STATUS_EN_COURS_LIVRAISON);

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/retry-delivery")->assertUnprocessable();
        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/retry-delivery")->assertForbidden();
    }

    public function test_a_new_order_gets_a_code_and_keeps_its_initial_price(): void
    {
        \Illuminate\Support\Facades\Http::fake(['*' => \Illuminate\Support\Facades\Http::response(['code' => 'Ok', 'routes' => [['distance' => 9000, 'duration' => 600, 'geometry' => ['coordinates' => [[2.41, 6.36], [2.36, 6.35]]]]]])]);
        Storage::fake('parcel_photos');

        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson('/api/v1/client/orders', [
            'type' => 'colis', 'pickup_address' => 'A', 'pickup_lat' => 6.36, 'pickup_lng' => 2.41,
            'dropoff_address' => 'B', 'dropoff_lat' => 6.35, 'dropoff_lng' => 2.36,
            'recipient_name' => 'Koffi', 'recipient_phone' => '+22901000000', 'price' => 1800,
            'photo' => UploadedFile::fake()->image('c.jpg'),
        ])->assertCreated()->assertJsonMissingPath('order.delivery_code');

        $order = Order::first();
        $this->assertMatchesRegularExpression('/^\d{4}$/', $order->delivery_code);
        $this->assertSame('1800.00', $order->initial_price);
    }
}
