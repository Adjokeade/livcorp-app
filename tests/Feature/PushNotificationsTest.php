<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Deliverer;
use App\Models\Order;
use App\Models\PriceOffer;
use App\Models\PushSubscription;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Notifications\ContactMessageReceived;
use App\Notifications\DelivererAccountRejected;
use App\Notifications\DelivererDocumentsReceived;
use App\Notifications\NewOrderAvailable;
use App\Notifications\OrderStatusUpdatedForClient;
use App\Notifications\PaymentValidatedForDeliverer;
use App\Notifications\PriceOfferAnswered;
use App\Notifications\PriceOfferReceived;
use App\Services\OrderStatusService;
use App\Services\PushService;
use App\Services\WebPushTransport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

class PushNotificationsTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function subscribe(User $user, string $endpoint = null): PushSubscription
    {
        $endpoint ??= 'https://fcm.googleapis.com/fcm/send/'.bin2hex(random_bytes(8));

        return PushSubscription::create([
            'user_id' => $user->id,
            'endpoint' => $endpoint,
            'endpoint_hash' => PushSubscription::hashEndpoint($endpoint),
            'public_key' => 'BPublicKey', 'auth_token' => 'authToken',
        ]);
    }

    private function payload(string $endpoint = 'https://fcm.googleapis.com/fcm/send/abc'): array
    {
        return ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'BPublicKeyValue', 'auth' => 'authSecret']];
    }

    private function fakeTransport(array $results): void
    {
        $transport = Mockery::mock(WebPushTransport::class);
        $transport->shouldReceive('configured')->andReturn(true);
        $transport->shouldReceive('send')->andReturnUsing(fn (array $sub) => $results[$sub['endpoint']] ?? ['success' => true, 'expired' => false, 'status' => 201, 'reason' => null]);
        $this->app->instance(WebPushTransport::class, $transport);
    }

    // ------------------------------------------------------------ Abonnements

    public function test_public_config_exposes_the_vapid_key_only_when_push_is_configured(): void
    {
        config(['services.webpush.public_key' => 'PUBKEY', 'services.webpush.private_key' => 'PRIVKEY']);
        $this->getJson('/api/v1/push/config')->assertOk()->assertJsonPath('enabled', true)->assertJsonPath('public_key', 'PUBKEY');

        config(['services.webpush.public_key' => null, 'services.webpush.private_key' => null]);
        $this->getJson('/api/v1/push/config')->assertJsonPath('enabled', false)->assertJsonPath('public_key', null);
    }

    public function test_the_private_key_is_never_exposed(): void
    {
        config(['services.webpush.public_key' => 'PUBKEY', 'services.webpush.private_key' => 'SECRET-PRIVATE-KEY']);

        $this->assertStringNotContainsString('SECRET-PRIVATE-KEY', $this->getJson('/api/v1/push/config')->getContent());
    }

    public function test_subscribing_requires_authentication(): void
    {
        $this->postJson('/api/v1/push/subscriptions', $this->payload())->assertUnauthorized();
    }

    public function test_a_device_can_subscribe(): void
    {
        $user = $this->makeUser('client');

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/push/subscriptions', $this->payload())->assertCreated();

        $this->assertSame(1, $user->pushSubscriptions()->count());
    }

    public function test_only_real_push_services_are_accepted_as_endpoints(): void
    {
        $this->actingAs($this->makeUser('client'), 'sanctum');

        foreach ([
            'https://fcm.googleapis.com/fcm/send/abc',
            'https://updates.push.services.mozilla.com/wpush/v2/abc',
            'https://web.push.apple.com/abc',
            'https://wns2-par02p.notify.windows.com/w/?token=abc',
        ] as $ok) {
            $this->postJson('/api/v1/push/subscriptions', $this->payload($ok))->assertCreated();
        }

        // Le serveur POSTe vers cette URL : une adresse interne ou un faux domaine ne doit jamais passer (SSRF).
        foreach ([
            'https://169.254.169.254/latest/meta-data',
            'https://evil.example.com/push',
            'https://fcm.googleapis.com.evil.com/x',
            'https://evilfcm.googleapis.com.attacker.io/x',
            'https://internal-service.local/hook',
        ] as $bad) {
            $this->postJson('/api/v1/push/subscriptions', $this->payload($bad))->assertJsonValidationErrors('endpoint');
        }
    }

    public function test_keys_are_required(): void
    {
        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/push/subscriptions', ['endpoint' => 'https://fcm.googleapis.com/fcm/send/abc'])
            ->assertJsonValidationErrors(['keys.p256dh', 'keys.auth']);
    }

    public function test_a_device_that_changes_account_changes_owner_instead_of_duplicating(): void
    {
        [$first, $second] = [$this->makeUser('client'), $this->makeUser('livreur')];

        $this->actingAs($first, 'sanctum')->postJson('/api/v1/push/subscriptions', $this->payload())->assertCreated();
        $this->actingAs($second, 'sanctum')->postJson('/api/v1/push/subscriptions', $this->payload())->assertCreated();

        $this->assertSame(1, PushSubscription::count());
        $this->assertSame($second->id, PushSubscription::first()->user_id);
    }

    public function test_a_user_unsubscribes_only_their_own_devices(): void
    {
        [$owner, $other] = [$this->makeUser('client'), $this->makeUser('client')];
        $subscription = $this->subscribe($owner);

        $this->actingAs($other, 'sanctum')->deleteJson('/api/v1/push/subscriptions', ['endpoint' => $subscription->endpoint])->assertOk();
        $this->assertSame(1, PushSubscription::count());

        $this->actingAs($owner, 'sanctum')->deleteJson('/api/v1/push/subscriptions', ['endpoint' => $subscription->endpoint])->assertOk();
        $this->assertSame(0, PushSubscription::count());
    }

    // ---------------------------------------------------------------- Envoi

    public function test_a_notification_reaches_every_device_of_the_user(): void
    {
        $user = $this->makeUser('client');
        $this->subscribe($user);
        $this->subscribe($user);
        $this->fakeTransport([]);

        $this->assertSame(2, app(PushService::class)->sendToUser($user, ['title' => 'Test']));
    }

    public function test_expired_subscriptions_are_removed_and_do_not_block_the_others(): void
    {
        $user = $this->makeUser('client');
        $gone = $this->subscribe($user, 'https://fcm.googleapis.com/fcm/send/gone');
        $this->subscribe($user, 'https://fcm.googleapis.com/fcm/send/alive');
        $this->fakeTransport(['https://fcm.googleapis.com/fcm/send/gone' => ['success' => false, 'expired' => true, 'status' => 410, 'reason' => 'Gone']]);

        $this->assertSame(1, app(PushService::class)->sendToUser($user, ['title' => 'Test']));
        $this->assertNull(PushSubscription::find($gone->id));
        $this->assertSame(1, PushSubscription::count());
    }

    public function test_a_transient_failure_keeps_the_subscription(): void
    {
        $user = $this->makeUser('client');
        $this->subscribe($user, 'https://fcm.googleapis.com/fcm/send/flaky');
        $this->fakeTransport(['https://fcm.googleapis.com/fcm/send/flaky' => ['success' => false, 'expired' => false, 'status' => 503, 'reason' => 'Unavailable']]);

        $this->assertSame(0, app(PushService::class)->sendToUser($user, ['title' => 'Test']));
        $this->assertSame(1, PushSubscription::count());
    }

    public function test_nothing_is_sent_when_vapid_keys_are_missing(): void
    {
        config(['services.webpush.public_key' => null, 'services.webpush.private_key' => null]);
        $user = $this->makeUser('client');
        $this->subscribe($user);

        $this->assertSame(0, app(PushService::class)->sendToUser($user, ['title' => 'Test']));
    }

    // ------------------------------------------------- Événements notifiés

    private function order(array $overrides = []): array
    {
        $client = $this->makeUser('client');

        return [$client, $this->makeOrder($client, null, Order::STATUS_CREEE, 3000, 'en_ligne', $overrides)];
    }

    public function test_a_new_order_alerts_only_available_deliverers_nearby_with_a_subscribed_device(): void
    {
        Notification::fake();
        Storage::fake('parcel_photos');
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [['distance' => 9000, 'duration' => 600, 'geometry' => ['coordinates' => [[2.41, 6.36], [2.36, 6.35]]]]]])]);

        $near = $this->makeDeliverer();      $near->update(['is_available' => true, 'current_lat' => 6.37, 'current_lng' => 2.40]);
        $far = $this->makeDeliverer();       $far->update(['is_available' => true, 'current_lat' => 9.34, 'current_lng' => 2.63]); // Parakou
        $offline = $this->makeDeliverer();   $offline->update(['is_available' => false, 'current_lat' => 6.37, 'current_lng' => 2.40]);
        $noDevice = $this->makeDeliverer();  $noDevice->update(['is_available' => true, 'current_lat' => 6.37, 'current_lng' => 2.40]);
        $unlocated = $this->makeDeliverer(); $unlocated->update(['is_available' => true]);
        foreach ([$near, $far, $offline, $unlocated] as $d) {
            $this->subscribe($d->user);
        }

        $this->actingAs($this->makeUser('client'), 'sanctum')->postJson('/api/v1/client/orders', [
            'type' => 'colis', 'pickup_address' => 'Dantokpa', 'pickup_lat' => 6.3654, 'pickup_lng' => 2.4183,
            'dropoff_address' => 'Fidjrossè', 'dropoff_lat' => 6.3520, 'dropoff_lng' => 2.3620,
            'recipient_name' => 'Koffi', 'recipient_phone' => '+22901000000', 'price' => 1800,
            'photo' => UploadedFile::fake()->image('c.jpg'),
        ])->assertCreated();

        Notification::assertSentTo($near->user, NewOrderAvailable::class);
        Notification::assertSentTo($unlocated->user, NewOrderAvailable::class); // position inconnue : prévenu quand même
        Notification::assertNotSentTo($far->user, NewOrderAvailable::class);
        Notification::assertNotSentTo($offline->user, NewOrderAvailable::class);
        Notification::assertNotSentTo($noDevice->user, NewOrderAvailable::class);
    }

    public function test_the_client_is_alerted_of_an_offer_and_of_a_revision_request(): void
    {
        Notification::fake();
        [$client, $order] = $this->order();
        $deliverer = $this->makeDeliverer();

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/offer", ['amount' => 4000])->assertCreated();
        Notification::assertSentTo($client, PriceOfferReceived::class, fn ($n) => $n->revision === false);

        $accepted = $this->makeOrder($client, $deliverer, Order::STATUS_ACCEPTEE, 3000);
        $this->postJson("/api/v1/deliverer/orders/{$accepted->id}/offer", ['amount' => 3500])->assertCreated();
        Notification::assertSentTo($client, PriceOfferReceived::class, fn ($n) => $n->revision === true);
    }

    public function test_deliverers_learn_who_won_and_who_did_not(): void
    {
        Notification::fake();
        [$client, $order] = $this->order();
        [$winner, $loser] = [$this->makeDeliverer(), $this->makeDeliverer()];
        $winning = PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $winner->id, 'amount' => 4000]);
        PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $loser->id, 'amount' => 3800]);

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/offers/{$winning->id}/accept")->assertOk();

        Notification::assertSentTo($winner->user, PriceOfferAnswered::class, fn ($n) => $n->answer === 'accepted');
        Notification::assertSentTo($loser->user, PriceOfferAnswered::class, fn ($n) => $n->answer === 'declined');
    }

    public function test_a_declined_offer_alerts_its_author(): void
    {
        Notification::fake();
        [$client, $order] = $this->order();
        $deliverer = $this->makeDeliverer();
        $offer = PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $deliverer->id, 'amount' => 4000]);

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/offers/{$offer->id}/decline")->assertOk();

        Notification::assertSentTo($deliverer->user, PriceOfferAnswered::class, fn ($n) => $n->answer === 'declined');
    }

    public function test_the_deliverer_is_alerted_when_the_client_validates_the_payment(): void
    {
        Notification::fake();
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, Order::STATUS_EN_COURS_LIVRAISON, 3000, 'en_ligne', ['payment_status' => 'en_attente', 'payment_method' => null]);

        $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/payment", ['method' => 'especes'])->assertOk();

        Notification::assertSentTo($deliverer->user, PaymentValidatedForDeliverer::class);
    }

    public function test_every_order_status_change_also_alerts_the_client_by_push(): void
    {
        Notification::fake();
        $client = $this->makeUser('client');
        $order = $this->makeOrder($client, $this->makeDeliverer(), Order::STATUS_ACCEPTEE, 3000);

        app(OrderStatusService::class)->transitionTo($order, Order::STATUS_COLIS_RECUPERE);

        Notification::assertSentTo($client, OrderStatusUpdatedForClient::class, fn ($n, $channels) => in_array(WebPushChannel::class, $channels, true));
    }

    public function test_admins_are_alerted_of_new_documents_and_contact_messages(): void
    {
        Notification::fake();
        Storage::fake('documents_private');
        $admin = $this->makeUser('admin');
        $inactiveAdmin = $this->makeUser('admin');
        $inactiveAdmin->update(['is_active' => false]);
        $deliverer = $this->makeDeliverer('pending');

        $this->actingAs($deliverer->user, 'sanctum')->postJson('/api/v1/deliverer/documents', ['id_card' => UploadedFile::fake()->image('cni.png')])->assertCreated();
        Notification::assertSentTo($admin, DelivererDocumentsReceived::class);
        Notification::assertNotSentTo($inactiveAdmin, DelivererDocumentsReceived::class);

        $this->postJson('/api/v1/contact', ['name' => 'Awa', 'email' => 'a@test.bj', 'subject' => 'Question', 'message' => 'Bonjour'])->assertCreated();
        Notification::assertSentTo($admin, ContactMessageReceived::class);
    }

    public function test_a_rejected_deliverer_is_told_why(): void
    {
        Notification::fake();
        $deliverer = $this->makeDeliverer('pending');

        $this->actingAs($this->makeUser('admin'), 'sanctum')
            ->postJson("/api/v1/admin/deliverers/{$deliverer->id}/reject", ['reason' => 'Permis illisible'])
            ->assertOk();

        Notification::assertSentTo($deliverer->user, DelivererAccountRejected::class);
    }

    // --------------------------------------------------------------- Contenu

    public function test_notification_payloads_are_short_and_carry_a_working_link(): void
    {
        $order = Order::make([
            'reference' => 'LIV-2026-ABC123', 'pickup_address' => 'Marché Dantokpa, Boulevard Saint-Michel, Cotonou',
            'dropoff_address' => 'Fidjrossé, 12e Arrondissement, Cotonou', 'distance_km' => 9.8, 'price' => 1800,
        ]);
        $order->id = 42;

        $payload = (new NewOrderAvailable($order))->toWebPush(new User);
        $this->assertSame('Marché Dantokpa → Fidjrossé · 9,8 km · 1 800 FCFA', $payload['body']);
        $this->assertStringEndsWith('/deliverer/tableau-de-bord', $payload['url']);

        $status = (new OrderStatusUpdatedForClient($order->forceFill(['status' => 'en_cours_livraison'])))->toWebPush(new User);
        $this->assertStringEndsWith('/client/suivi/42', $status['url']);
        $this->assertStringContainsString('validez le paiement', $status['body']);
    }
}
