<?php

namespace Tests\Feature;

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Adresses, distance routière, photo du colis et prix fixé par le client.
 */
class OrderCreationTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function fakeOsrm(): void
    {
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [[
            'distance' => 9190, 'duration' => 600,
            'geometry' => ['coordinates' => [[2.4183, 6.3654], [2.4000, 6.3600], [2.3620, 6.3520]]],
        ]]])]);
    }

    private function trip(array $overrides = []): array
    {
        return array_merge([
            'pickup_lat' => 6.3654, 'pickup_lng' => 2.4183,
            'dropoff_lat' => 6.3520, 'dropoff_lng' => 2.3620,
        ], $overrides);
    }

    private function order(array $overrides = []): array
    {
        return $this->trip() + array_merge([
            'type' => 'colis',
            'pickup_address' => 'Marché Dantokpa, Cotonou',
            'pickup_details' => 'Près de la porte principale',
            'dropoff_address' => 'Fidjrossé, Cotonou',
            'dropoff_details' => 'En face de la pharmacie',
            'recipient_name' => 'Koffi',
            'recipient_phone' => '+22901000000',
            'price' => 1500,
            'photo' => UploadedFile::fake()->image('colis.jpg', 1200, 900),
        ], $overrides);
    }

    public function test_estimate_uses_the_road_distance_and_suggests_prices(): void
    {
        $this->fakeOsrm();

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders/estimate', $this->trip())
            ->assertOk()
            ->assertJsonPath('distance_km', 9.19)
            ->assertJsonPath('duration_min', 10)
            ->assertJsonPath('distance_source', 'route')
            ->assertJsonPath('suggested_prices.standard', 1880)
            ->assertJsonPath('suggested_prices.express', 2630)
            ->assertJsonCount(3, 'route')
            ->assertJsonPath('route.0', [6.3654, 2.4183]); // [lat, lng] pour Leaflet
    }

    public function test_estimate_falls_back_to_an_approximation_when_routing_is_down(): void
    {
        Http::fake(['*' => Http::response('boom', 500)]);

        $response = $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders/estimate', $this->trip())
            ->assertOk()
            ->assertJsonPath('distance_source', 'approx');

        // Vol d'oiseau (~6,4 km) majoré de 35 % : on ne doit jamais retomber sous la distance à vol d'oiseau.
        $this->assertGreaterThan(8, $response->json('distance_km'));
    }

    public function test_addresses_outside_benin_are_refused(): void
    {
        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders/estimate', $this->trip(['dropoff_lat' => 48.85, 'dropoff_lng' => 2.35]))
            ->assertJsonValidationErrors('dropoff_lat')
            ->assertJsonPath('errors.dropoff_lat.0', 'Cette adresse doit se trouver au Bénin.');
    }

    public function test_identical_pickup_and_dropoff_are_refused(): void
    {
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [['distance' => 12, 'duration' => 5, 'geometry' => ['coordinates' => [[2.4, 6.3], [2.4, 6.3]]]]]])]);

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders/estimate', $this->trip(['dropoff_lat' => 6.3654, 'dropoff_lng' => 2.4183]))
            ->assertJsonValidationErrors('dropoff_lat');
    }

    public function test_order_keeps_the_price_fixed_by_the_client_and_stores_the_photo(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeOsrm();

        $response = $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders', $this->order())
            ->assertCreated()
            ->assertJsonPath('order.price', '1500.00')            // le prix du client, pas le conseillé
            ->assertJsonPath('order.price_suggested', '1880.00')
            ->assertJsonPath('order.distance_km', '9.19')       // distance routière recalculée côté serveur
            ->assertJsonPath('order.pickup_details', 'Près de la porte principale')
            ->assertJsonMissingPath('order.photo_path');

        $order = Order::first();
        Storage::disk('parcel_photos')->assertExists($order->photo_path);
        $this->assertNotNull($response->json('order.photo_url'));
    }

    public function test_photo_is_reencoded_and_resized(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeOsrm();

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders', $this->order(['photo' => UploadedFile::fake()->image('gros.png', 3200, 2400)]))
            ->assertCreated();

        [$width, $height, $type] = getimagesizefromstring(Storage::disk('parcel_photos')->get(Order::first()->photo_path));
        $this->assertSame(1600, $width);
        $this->assertSame(1200, $height);
        $this->assertSame(IMAGETYPE_JPEG, $type);
    }

    public function test_a_parcel_needs_a_photo_but_an_errand_does_not(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeOsrm();
        $this->actingAs($this->makeUser('client'), 'sanctum');

        $this->postJson('/api/v1/client/orders', $this->order(['photo' => null]))
            ->assertJsonValidationErrors('photo');

        $this->postJson('/api/v1/client/orders', $this->order(['photo' => null, 'type' => 'course']))->assertCreated();
    }

    public function test_a_non_image_file_is_refused(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeOsrm();

        $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders', $this->order(['photo' => UploadedFile::fake()->create('virus.pdf', 10, 'application/pdf')]))
            ->assertJsonValidationErrors('photo');
    }

    public function test_price_must_be_a_whole_amount_within_limits(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeOsrm();
        $this->actingAs($this->makeUser('client'), 'sanctum');

        $this->postJson('/api/v1/client/orders', $this->order(['price' => 100]))->assertJsonValidationErrors('price');
        $this->postJson('/api/v1/client/orders', $this->order(['price' => 2000000]))->assertJsonValidationErrors('price');
        $this->postJson('/api/v1/client/orders', $this->order(['price' => 1500.5]))->assertJsonValidationErrors('price');
    }

    public function test_photo_url_is_signed_and_tampering_is_refused(): void
    {
        Storage::fake('parcel_photos');
        $this->fakeOsrm();

        $url = $this->actingAs($this->makeUser('client'), 'sanctum')
            ->postJson('/api/v1/client/orders', $this->order())
            ->json('order.photo_url');

        $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        $orderId = Order::first()->id;
        $this->get("/api/v1/orders/{$orderId}/photo")->assertForbidden();                 // sans signature
        $this->get(preg_replace('/signature=\w+/', 'signature=deadbeef', $url))->assertForbidden(); // signature falsifiée
    }

    public function test_photo_url_is_stable_within_the_hour(): void
    {
        $order = $this->makeOrder($this->makeUser('client'), null, Order::STATUS_CREEE);
        $order->update(['photo_path' => 'orders/x.jpg']);

        // Sinon le navigateur rechargerait l'image à chaque relecture (toutes les 4 s) de la commande.
        $this->assertSame($order->fresh()->photo_url, $order->fresh()->photo_url);
    }
}
