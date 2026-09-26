<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PriceOffer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * Les annonces (colis en attente d'un livreur) : ce que voit chacun avant d'avoir accepté la course.
 */
class MarketplaceAnnouncementsTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function announcement(array $overrides = []): Order
    {
        return $this->makeOrder($this->makeUser('client'), null, Order::STATUS_CREEE, 1800, 'en_ligne', $overrides + [
            'pickup_address' => 'Marché Dantokpa, Boulevard Saint-Michel, Dantokpa, Cotonou, Littoral',
            'dropoff_address' => 'Fidjrossé, 12ᵉ Arrondissement, Cotonou, Littoral',
            'pickup_details' => 'Portail bleu, code 4821',
            'instructions' => 'Sonner deux fois',
            'recipient_name' => 'Koffi Mensah',
            'recipient_phone' => '+22901970000',
            'package_type' => 'Carton de vêtements',
            'distance_km' => 9.8, 'duration_min' => 11,
            'photo_path' => 'orders/x.jpg',
        ]);
    }

    public function test_areas_keep_the_neighbourhood_and_drop_street_and_number(): void
    {
        $this->assertSame('Dantokpa, Cotonou', Order::areaOf('Marché Dantokpa, Boulevard Saint-Michel, Dantokpa, Cotonou, Littoral'));
        $this->assertSame('Fidjrossé, 12ᵉ Arrondissement, Cotonou', Order::areaOf('Fidjrossé, 12ᵉ Arrondissement, Cotonou, Littoral'));
        $this->assertSame('12ᵉ Arrondissement, Cotonou', Order::areaOf('Rue 12.341, 12ᵉ Arrondissement, Cotonou'));
        $this->assertSame('Akpakpa, Cotonou', Order::areaOf('Akpakpa, Cotonou'));
        $this->assertSame('Cotonou', Order::areaOf('Cotonou'));
        $this->assertSame('Bénin', Order::areaOf(''));
    }

    public function test_the_public_page_shows_areas_but_no_exact_address_nor_personal_data(): void
    {
        $this->announcement();

        $response = $this->getJson('/api/v1/marketplace/orders')->assertOk();
        $item = $response->json('data.0');

        $this->assertSame('Dantokpa, Cotonou', $item['pickup_area']);
        $this->assertSame('Fidjrossé, 12ᵉ Arrondissement, Cotonou', $item['dropoff_area']);
        $this->assertSame('Carton de vêtements', $item['package_type']);
        $this->assertSame(11, $item['duration_min']);

        $raw = $response->getContent();
        foreach (['Boulevard', 'Portail bleu', '4821', 'Sonner', 'Koffi', '01970000', 'pickup_lat', 'recipient', 'instructions', 'orders\/x.jpg'] as $secret) {
            $this->assertStringNotContainsString($secret, $raw, "fuite : {$secret}");
        }
    }

    public function test_the_photo_is_hidden_from_visitors_and_clients_but_shown_to_verified_deliverers_and_admins(): void
    {
        $order = $this->announcement();

        $this->getJson('/api/v1/marketplace/orders')
            ->assertJsonPath('data.0.has_photo', true)
            ->assertJsonPath('data.0.photo_url', null);

        $this->actingAs($this->makeUser('client'), 'sanctum')->getJson('/api/v1/marketplace/orders')->assertJsonPath('data.0.photo_url', null);
        $this->actingAs($this->makeDeliverer('pending')->user, 'sanctum')->getJson('/api/v1/marketplace/orders')->assertJsonPath('data.0.photo_url', null);

        $this->actingAs($this->makeDeliverer()->user, 'sanctum')->getJson('/api/v1/marketplace/orders')
            ->assertJsonPath('data.0.photo_url', $order->fresh()->photo_url);
        $this->actingAs($this->makeUser('admin'), 'sanctum')->getJson('/api/v1/marketplace/orders')
            ->assertJsonPath('data.0.photo_url', $order->fresh()->photo_url);
    }

    public function test_only_free_orders_are_listed_with_their_pending_offers_count(): void
    {
        $order = $this->announcement();
        PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $this->makeDeliverer()->id, 'amount' => 2500]);
        PriceOffer::create(['order_id' => $order->id, 'deliverer_id' => $this->makeDeliverer()->id, 'amount' => 2200, 'status' => 'declined']);
        $this->makeOrder($this->makeUser('client'), $this->makeDeliverer(), Order::STATUS_ACCEPTEE);

        $this->getJson('/api/v1/marketplace/orders')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.offers_count', 1);
    }

    public function test_the_deliverer_sees_addresses_and_landmarks_but_not_the_recipient_before_accepting(): void
    {
        $this->announcement();
        $deliverer = $this->makeDeliverer();

        $response = $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertOk();
        $item = $response->json('data.0');

        $this->assertStringContainsString('Boulevard Saint-Michel', $item['pickup_address']);
        $this->assertSame('Portail bleu, code 4821', $item['pickup_details']);
        $this->assertSame(0, $item['offers_count']);
        $this->assertNotNull($item['client_first_name']);
        $this->assertArrayNotHasKey('recipient_name', $item);
        $this->assertArrayNotHasKey('recipient_phone', $item);
        $this->assertArrayNotHasKey('client', $item);
    }

    public function test_the_recipient_is_revealed_once_the_course_is_accepted(): void
    {
        $order = $this->announcement();
        $deliverer = $this->makeDeliverer();

        $this->actingAs($deliverer->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertOk();

        $this->getJson('/api/v1/deliverer/orders/mine')
            ->assertJsonPath('data.0.recipient_name', 'Koffi Mensah')
            ->assertJsonPath('data.0.recipient_phone', '+22901970000');
    }
}
