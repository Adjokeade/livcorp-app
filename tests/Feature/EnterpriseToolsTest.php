<?php

namespace Tests\Feature;

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Envoi en lot, statistiques et carnet de destinataires de l'expéditeur. */
class EnterpriseToolsTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function entreprise()
    {
        $user = $this->makeUser('client');
        $user->update(['account_type' => 'entreprise', 'company_name' => 'ACME']);

        return $user;
    }

    private function fakeOsrm(): void
    {
        Http::fake(['*' => Http::response(['code' => 'Ok', 'routes' => [[
            'distance' => 9190, 'duration' => 600,
            'geometry' => ['coordinates' => [[2.4183, 6.3654], [2.3620, 6.3520]]],
        ]]])]);
    }

    private function row(array $overrides = []): array
    {
        return array_merge([
            'type' => 'colis', 'dropoff_address' => 'Fidjrossé, Cotonou',
            'dropoff_lat' => 6.3520, 'dropoff_lng' => 2.3620,
            'recipient_name' => 'Koffi', 'recipient_phone' => '+22901000000',
            'price' => 1500, 'photo' => UploadedFile::fake()->image('c.jpg', 600, 600),
        ], $overrides);
    }

    private function batch(array $rows): array
    {
        return [
            'pickup_address' => 'Dantokpa, Cotonou', 'pickup_lat' => 6.3654, 'pickup_lng' => 2.4183,
            'orders' => $rows,
        ];
    }

    public function test_batch_creates_one_order_per_recipient(): void
    {
        Storage::fake();
        $this->fakeOsrm();
        $user = $this->entreprise();

        $this->actingAs($user, 'sanctum')
            ->post('/api/v1/client/orders/batch', $this->batch([$this->row(), $this->row(['recipient_name' => 'Ama'])]), ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonCount(2, 'orders');

        $this->assertSame(2, Order::where('client_id', $user->id)->count());
    }

    public function test_batch_is_all_or_nothing_and_errors_point_to_the_row(): void
    {
        Storage::fake();
        $this->fakeOsrm();
        $user = $this->entreprise();

        $this->actingAs($user, 'sanctum')
            ->post('/api/v1/client/orders/batch', $this->batch([$this->row(), $this->row(['photo' => null])]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['orders.1.photo']);

        $this->assertSame(0, Order::count());
    }

    public function test_batch_is_reserved_to_entreprise_accounts(): void
    {
        $particulier = $this->makeUser('client');
        $particulier->update(['account_type' => 'particulier']);

        $this->actingAs($particulier, 'sanctum')
            ->post('/api/v1/client/orders/batch', $this->batch([$this->row()]), ['Accept' => 'application/json'])
            ->assertForbidden();
    }

    public function test_stats_count_orders_of_the_current_month(): void
    {
        $user = $this->entreprise();
        $base = ['client_id' => $user->id, 'type' => 'colis', 'pickup_address' => 'A', 'pickup_lat' => 6.36, 'pickup_lng' => 2.41,
            'dropoff_address' => 'B', 'dropoff_lat' => 6.35, 'dropoff_lng' => 2.36, 'recipient_name' => 'K', 'recipient_phone' => '1',
            'distance_km' => 5, 'duration_min' => 10, 'price' => 1000, 'price_suggested' => 1000, 'initial_price' => 1000,
            'delivery_code' => '1234', 'payment_status' => 'en_attente'];
        foreach (['livree', 'livree', 'annulee', 'creee'] as $i => $status) {
            Order::create($base + ['reference' => "LIV-T-{$i}", 'status' => $status]);
        }

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/client/stats')
            ->assertOk()
            ->assertJsonPath('this_month.total', 4)
            ->assertJsonPath('this_month.delivered', 2)
            ->assertJsonPath('this_month.spent', 2000)
            ->assertJsonPath('this_month.success_rate', 67)
            ->assertJsonPath('in_progress', 1)
            ->assertJsonCount(6, 'history');
    }

    public function test_recipients_are_private(): void
    {
        $a = $this->makeUser('client');
        $b = $this->makeUser('client');
        $payload = ['name' => 'Koffi', 'phone' => '+22901000000', 'address' => 'Cotonou', 'lat' => 6.35, 'lng' => 2.38];

        $id = $this->actingAs($a, 'sanctum')->postJson('/api/v1/client/recipients', $payload)->assertCreated()->json('id');
        $this->actingAs($b, 'sanctum')->getJson('/api/v1/client/recipients')->assertOk()->assertJsonCount(0);
        $this->actingAs($b, 'sanctum')->deleteJson("/api/v1/client/recipients/{$id}")->assertNotFound();
        $this->actingAs($a, 'sanctum')->deleteJson("/api/v1/client/recipients/{$id}")->assertNoContent();
    }
}
