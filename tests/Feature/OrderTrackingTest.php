<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\TrackingPoint;
use App\Notifications\DelivererNearby;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Le client suit son colis : position du livreur, trace, direction, temps restant, fraîcheur.
 */
class OrderTrackingTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private const PICKUP = [6.3727, 2.4335];   // Dantokpa
    private const DROPOFF = [6.3525, 2.3675];  // Fidjrossé

    private function fakeOsrm(int $meters = 2400, int $seconds = 360): void
    {
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [[
            'distance' => $meters, 'duration' => $seconds, 'geometry' => ['coordinates' => [[2.4, 6.36], [2.39, 6.37]]],
        ]]])]);
    }

    private function trackedOrder(string $status): array
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, $status, 1800, 'en_ligne', [
            'pickup_lat' => self::PICKUP[0], 'pickup_lng' => self::PICKUP[1],
            'dropoff_lat' => self::DROPOFF[0], 'dropoff_lng' => self::DROPOFF[1],
        ]);

        return [$client, $deliverer, $order];
    }

    private function point(Order $order, float $lat, float $lng, ?\DateTimeInterface $at = null): TrackingPoint
    {
        return TrackingPoint::create([
            'order_id' => $order->id, 'deliverer_id' => $order->deliverer_id,
            'lat' => $lat, 'lng' => $lng, 'recorded_at' => $at ?? now(),
        ]);
    }

    public function test_no_position_yet_is_a_normal_answer_not_an_error(): void
    {
        [$client, , $order] = $this->trackedOrder(Order::STATUS_ACCEPTEE);

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")
            ->assertOk()
            ->assertJsonPath('position', null)
            ->assertJsonPath('sharing', false)
            ->assertJsonPath('eta_min', null)
            ->assertJsonCount(0, 'trail');
    }

    public function test_the_client_gets_position_direction_and_time_remaining(): void
    {
        $this->fakeOsrm(2400, 360);
        [$client, , $order] = $this->trackedOrder(Order::STATUS_ACCEPTEE);
        $this->point($order, 6.36, 2.40);

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")
            ->assertOk()
            ->assertJsonPath('position.lat', 6.36)
            ->assertJsonPath('position.lng', 2.4)
            ->assertJsonPath('target', 'pickup')       // il se rend d'abord chez l'expéditeur
            ->assertJsonPath('distance_km', 2.4)
            ->assertJsonPath('eta_min', 6)
            ->assertJsonPath('sharing', true);
    }

    public function test_the_target_becomes_the_destination_once_the_parcel_is_picked_up(): void
    {
        $this->fakeOsrm();
        foreach ([Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON] as $status) {
            [$client, , $order] = $this->trackedOrder($status);
            $this->point($order, 6.36, 2.40);

            $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")->assertJsonPath('target', 'dropoff');
        }
    }

    public function test_no_direction_or_time_once_the_order_is_over(): void
    {
        $this->fakeOsrm();
        [$client, , $order] = $this->trackedOrder(Order::STATUS_LIVREE);
        $this->point($order, 6.35, 2.37);

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")
            ->assertJsonPath('target', null)
            ->assertJsonPath('eta_min', null);
    }

    public function test_within_a_hundred_metres_the_deliverer_is_shown_as_arrived_without_a_route_call(): void
    {
        Http::fake(); // aucune requête d'itinéraire ne doit partir
        [$client, , $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);
        // ~70 m de la destination, à vol d'oiseau
        $this->point($order, self::DROPOFF[0] + 0.0006, self::DROPOFF[1]);

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")
            ->assertJsonPath('eta_min', 0)
            ->assertJsonPath('target', 'dropoff');

        Http::assertNothingSent();
    }

    public function test_beyond_a_hundred_metres_the_route_time_is_used(): void
    {
        $this->fakeOsrm(400, 90);
        [$client, , $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);
        $this->point($order, self::DROPOFF[0] + 0.004, self::DROPOFF[1]); // ~450 m

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")
            ->assertJsonPath('eta_min', 2)
            ->assertJsonPath('distance_km', 0.4);
    }

    public function test_the_trail_is_oldest_first_and_capped(): void
    {
        [$client, , $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);
        $this->fakeOsrm();
        foreach (range(1, 70) as $i) {
            $this->point($order, 6.30 + $i / 1000, 2.40, now()->subSeconds(100 - $i));
        }

        $trail = $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")->json('trail');

        $this->assertCount(60, $trail);
        $this->assertLessThan($trail[59][0], $trail[0][0]);        // du plus ancien au plus récent
        $this->assertEqualsWithDelta(6.37, $trail[59][0], 0.0001); // la dernière position est bien la plus récente
    }

    public function test_an_old_position_is_not_presented_as_live(): void
    {
        $this->fakeOsrm();
        [$client, , $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);
        $this->point($order, 6.36, 2.40, now()->subMinutes(5));

        $response = $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")
            ->assertJsonPath('sharing', false);

        $this->assertGreaterThanOrEqual(299, $response->json('position.age_seconds'));
    }

    public function test_only_the_owner_can_follow_an_order(): void
    {
        [, , $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);

        $this->actingAs($this->makeUser('client'), 'sanctum')->getJson("/api/v1/client/orders/{$order->id}/track")->assertForbidden();
    }

    // ----------------------------------------------- Envoi de position par le livreur

    public function test_the_deliverer_shares_his_position_while_heading_to_the_pickup_too(): void
    {
        [, $deliverer, $order] = $this->trackedOrder(Order::STATUS_ACCEPTEE);

        $this->actingAs($deliverer->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.36, 'lng' => 2.40])
            ->assertOk();

        $this->assertSame(1, TrackingPoint::count());
        $this->assertSame('6.3600000', $deliverer->fresh()->current_lat);
    }

    public function test_position_sharing_stops_being_accepted_once_the_order_is_over(): void
    {
        foreach ([Order::STATUS_LIVREE, Order::STATUS_ANNULEE] as $status) {
            [, $deliverer, $order] = $this->trackedOrder($status);

            $this->actingAs($deliverer->user, 'sanctum')
                ->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.36, 'lng' => 2.40])
                ->assertUnprocessable()
                ->assertJsonPath('message', "Cette course n'est plus en cours.");
        }
        $this->assertSame(0, TrackingPoint::count());
    }

    public function test_only_the_assigned_deliverer_can_share_a_position(): void
    {
        [, , $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.36, 'lng' => 2.40])
            ->assertForbidden();
    }

    public function test_the_client_is_warned_once_when_the_deliverer_is_close(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->trackedOrder(Order::STATUS_EN_COURS_LIVRAISON);
        $this->actingAs($deliverer->user, 'sanctum');

        // Loin (~2,5 km) : rien.
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.37, 'lng' => 2.40])->assertOk();
        Notification::assertNotSentTo($client, DelivererNearby::class);

        // À ~150 m : prévenu.
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => self::DROPOFF[0] + 0.0013, 'lng' => self::DROPOFF[1]])->assertOk();
        Notification::assertSentToTimes($client, DelivererNearby::class, 1);

        // Il se rapproche encore : pas de deuxième alerte.
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => self::DROPOFF[0], 'lng' => self::DROPOFF[1]])->assertOk();
        Notification::assertSentToTimes($client, DelivererNearby::class, 1);
    }

    public function test_no_arrival_alert_before_the_parcel_is_picked_up(): void
    {
        Notification::fake();
        [$client, $deliverer, $order] = $this->trackedOrder(Order::STATUS_ACCEPTEE);

        $this->actingAs($deliverer->user, 'sanctum')
            ->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => self::DROPOFF[0], 'lng' => self::DROPOFF[1]])
            ->assertOk();

        Notification::assertNotSentTo($client, DelivererNearby::class);
    }
}
