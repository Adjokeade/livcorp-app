<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\TrackingPoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Itinéraire du livreur : ses colis en main, chacun avec la distance jusqu'à sa destination depuis sa position. */
class RoutePlanTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private const HERE = [6.3600, 2.4000];

    private function fakeLegs(array $legs): void
    {
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [[
            'distance' => array_sum(array_column($legs, 0)),
            'duration' => array_sum(array_column($legs, 1)),
            'legs' => array_map(fn ($l) => ['distance' => $l[0], 'duration' => $l[1]], $legs),
            'geometry' => ['coordinates' => [[2.4, 6.36], [2.45, 6.40]]],
        ]]])]);
    }

    private function carried(string $status, $deliverer, array $dropoff, ?array $pickup = null)
    {
        return $this->makeOrder($this->makeUser('client'), $deliverer, $status, 1500, 'especes', [
            'pickup_lat' => ($pickup ?? [6.30, 2.30])[0], 'pickup_lng' => ($pickup ?? [6.30, 2.30])[1],
            'dropoff_lat' => $dropoff[0], 'dropoff_lng' => $dropoff[1],
        ]);
    }

    public function test_each_carried_parcel_gets_the_distance_to_its_own_destination_nearest_first(): void
    {
        Cache::flush();
        $deliverer = $this->makeDeliverer();
        $far = $this->carried(Order::STATUS_COLIS_RECUPERE, $deliverer, [6.4000, 2.4500]);
        $near = $this->carried(Order::STATUS_EN_COURS_LIVRAISON, $deliverer, [6.3610, 2.4010]);
        $this->fakeLegs([[300, 120], [7200, 900]]); // 0,3 km / 2 min, puis 7,2 km / 15 min

        $response = $this->actingAs($deliverer->user, 'sanctum')
            ->getJson('/api/v1/deliverer/route-plan?lat='.self::HERE[0].'&lng='.self::HERE[1])
            ->assertOk();

        $stops = $response->json('stops');
        $this->assertSame([$near->id, $far->id], array_column($stops, 'order_id'));
        $this->assertSame(['dropoff', 'dropoff'], array_column($stops, 'type'));
        $this->assertSame(0.3, $stops[0]['distance_km']);
        $this->assertSame(2, $stops[0]['eta_min']);
        $this->assertSame(7.5, $stops[1]['distance_km']);      // cumulé depuis la position du livreur
        $this->assertSame(17, $stops[1]['eta_min']);
        $response->assertJsonPath('total_distance_km', 7.5)->assertJsonPath('total_duration_min', 17)->assertJsonPath('source', 'route');
    }

    public function test_a_parcel_is_delivered_only_after_it_is_picked_up(): void
    {
        Cache::flush();
        $deliverer = $this->makeDeliverer();
        // Collecte proche, destination lointaine : la destination ne peut venir qu'après la collecte.
        $order = $this->carried(Order::STATUS_ACCEPTEE, $deliverer, [6.4000, 2.4500], [6.3610, 2.4010]);
        $this->fakeLegs([[300, 120], [7200, 900]]);

        $stops = $this->actingAs($deliverer->user, 'sanctum')
            ->getJson('/api/v1/deliverer/route-plan?lat='.self::HERE[0].'&lng='.self::HERE[1])
            ->assertOk()->json('stops');

        $this->assertSame(['pickup', 'dropoff'], array_column($stops, 'type'));
        $this->assertSame([$order->id, $order->id], array_column($stops, 'order_id'));
    }

    public function test_distances_are_approximated_when_the_routing_service_is_down(): void
    {
        Cache::flush();
        Http::fake(['*' => Http::response('', 500)]);
        $deliverer = $this->makeDeliverer();
        $this->carried(Order::STATUS_COLIS_RECUPERE, $deliverer, [6.4000, 2.4500]);

        $this->actingAs($deliverer->user, 'sanctum')
            ->getJson('/api/v1/deliverer/route-plan?lat='.self::HERE[0].'&lng='.self::HERE[1])
            ->assertOk()->assertJsonPath('source', 'approx')->assertJsonPath('stops.0.order', 1);
    }

    public function test_the_last_known_position_is_used_and_an_unknown_one_is_refused(): void
    {
        Cache::flush();
        $this->fakeLegs([[500, 120]]);
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['current_lat' => null, 'current_lng' => null]);

        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/route-plan')->assertUnprocessable();

        $deliverer->update(['current_lat' => self::HERE[0], 'current_lng' => self::HERE[1]]);
        $this->carried(Order::STATUS_COLIS_RECUPERE, $deliverer, [6.3610, 2.4010]);
        $this->actingAs($deliverer->user->fresh(), 'sanctum')->getJson('/api/v1/deliverer/route-plan')->assertOk()->assertJsonCount(1, 'stops');
    }

    public function test_an_empty_plan_when_nothing_is_in_progress(): void
    {
        $deliverer = $this->makeDeliverer();

        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/route-plan?lat=6.36&lng=2.40')
            ->assertOk()->assertJsonPath('stops', [])->assertJsonPath('total_distance_km', 0);
    }

    public function test_an_impossible_position_jump_is_ignored_and_accuracy_is_stored(): void
    {
        Cache::flush();
        $deliverer = $this->makeDeliverer();
        $order = $this->carried(Order::STATUS_COLIS_RECUPERE, $deliverer, [6.4000, 2.4500]);
        $this->actingAs($deliverer->user, 'sanctum');

        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.36, 'lng' => 2.40, 'accuracy' => 12.4])->assertOk();
        $this->assertSame(12, TrackingPoint::first()->accuracy_m);

        // 20 km plus loin quelques secondes après : lecture GPS aberrante.
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.54, 'lng' => 2.40])->assertOk()->assertJsonPath('ignored', true);
        $this->assertSame(1, TrackingPoint::count());

        // Un déplacement normal passe.
        $this->postJson("/api/v1/deliverer/orders/{$order->id}/location", ['lat' => 6.3602, 'lng' => 2.4002])->assertOk()->assertJsonMissingPath('ignored');
        $this->assertSame(2, TrackingPoint::count());
    }
}
