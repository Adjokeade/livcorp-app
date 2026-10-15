<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Order;
use App\Models\OrderRelease;
use App\Models\Review;
use App\Models\Setting;
use App\Services\GeolocationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Outils de contrôle de l'administration : utilisateurs, livreurs, livraisons, barème. */
class AdminControlTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function admin()
    {
        return $this->makeUser('admin');
    }

    public function test_these_tools_are_closed_to_non_admins(): void
    {
        $client = $this->makeUser('client');

        foreach (['users', 'deliverers', 'orders', 'tariff'] as $path) {
            $this->actingAs($client, 'sanctum')->getJson("/api/v1/admin/{$path}")->assertForbidden();
        }
    }

    public function test_users_can_be_searched_and_deactivated_but_not_admins(): void
    {
        $admin = $this->admin();
        $client = $this->makeUser('client');
        $client->update(['first_name' => 'Zakari']);
        $this->makeUser('livreur');
        $token = $client->createToken('t');

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/users?q=Zakari')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/users?role=livreur')->assertJsonCount(1, 'data');
        // Les administrateurs n'apparaissent pas dans la liste.
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/users')->assertJsonCount(2, 'data');

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$client->id}", ['is_active' => false])->assertOk();
        $this->assertFalse($client->fresh()->is_active);
        $this->assertSame(0, $client->tokens()->count());

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$admin->id}", ['is_active' => false])->assertForbidden();
    }

    public function test_admin_lists_deliverers_by_status(): void
    {
        $this->makeDeliverer('approved');
        $this->makeDeliverer('pending');

        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/deliverers?status=pending')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/deliverers')->assertJsonCount(2, 'data');
    }

    public function test_admin_cancels_an_open_order_with_a_reason_and_not_a_delivered_one(): void
    {
        Notification::fake();
        $admin = $this->admin();
        $client = $this->makeUser('client');
        $open = $this->makeOrder($client, null, Order::STATUS_CREEE);
        $done = $this->makeOrder($client, $this->makeDeliverer(), Order::STATUS_ANNULEE);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/orders/{$open->id}/cancel", [])->assertUnprocessable();
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/orders/{$open->id}/cancel", ['reason' => 'Colis interdit'])->assertOk();

        $this->assertSame('annulee', $open->fresh()->status);
        $this->assertSame('Annulée par LIV corp : Colis interdit', $open->statusHistory()->latest('id')->first()->note);
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/orders/{$done->id}/cancel", ['reason' => 'x'])->assertUnprocessable();

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders?status=annulee')->assertJsonCount(2, 'data');
    }

    public function test_the_tariff_is_editable_and_drives_price_estimates(): void
    {
        $admin = $this->admin();
        $geo = app(GeolocationService::class);
        $this->assertSame(1250.0, $geo->estimatePrice(5)); // 500 + 5 × 150

        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/tariff', ['base_fare' => 1000, 'per_km' => 200, 'express_multiplier' => 1.5])
            ->assertOk()->assertJsonPath('tariff.per_km', 200);

        $this->assertSame(2000.0, $geo->estimatePrice(5)); // 1000 + 5 × 200
        $this->assertSame(3000.0, $geo->estimatePrice(5, 'express'));
        $this->assertSame(1000, Setting::read('tariff')['base_fare']);

        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/tariff', ['base_fare' => 1000, 'per_km' => 200, 'express_multiplier' => 0.5])->assertUnprocessable();
    }

    public function test_dashboard_exposes_menu_badges(): void
    {
        $this->makeDeliverer('pending');

        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/dashboard/stats')
            ->assertOk()->assertJsonPath('pending_deliverers', 1)->assertJsonStructure(['new_messages', 'open_disputes']);
    }

    public function test_admin_negotiates_a_tariff_with_an_enterprise_owner_only(): void
    {
        $admin = $this->admin();
        $owner = $this->makeUser('client');
        $owner->update(['account_type' => 'entreprise']);
        $member = $this->makeUser('client');
        $member->update(['account_type' => 'entreprise', 'company_id' => $owner->id, 'team_role' => 'operateur']);
        $particulier = $this->makeUser('client');
        $tariff = ['base_fare' => 300, 'per_km' => 100, 'express_multiplier' => 1.2];

        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/admin/users/{$owner->id}/tariff", $tariff)->assertOk();
        $this->assertSame(300, $owner->fresh()->custom_tariff['base_fare']);
        // Le collaborateur hérite du tarif négocié du propriétaire : 300 + 1 km × 100.
        $this->assertSame(400.0, app(GeolocationService::class)->estimatePrice(1.0, 'standard', null, GeolocationService::tariffFor($member->fresh())));

        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/admin/users/{$member->id}/tariff", $tariff)->assertUnprocessable();
        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/admin/users/{$particulier->id}/tariff", $tariff)->assertUnprocessable();
        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/admin/users/{$owner->id}/tariff", ['base_fare' => 300, 'per_km' => 100, 'express_multiplier' => 0.5])->assertUnprocessable();

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/admin/users/{$owner->id}/tariff")->assertNoContent();
        $this->assertNull($owner->fresh()->custom_tariff);
        $this->actingAs($this->makeUser('client'), 'sanctum')->putJson("/api/v1/admin/users/{$owner->id}/tariff", $tariff)->assertForbidden();
    }

    public function test_admin_sees_a_detailed_deliverer_profile(): void
    {
        $admin = $this->admin();
        $deliverer = $this->makeDeliverer();
        $deliverer->update(['vehicle_plate' => 'AB-1234-RB', 'emergency_phone' => '+22901999999', 'mobile_money_number' => '+22901000301']);
        $client = $this->makeUser('client');

        $done = $this->makeOrder($client, $deliverer, Order::STATUS_LIVREE, 2000);
        $done->update(['distance_km' => 5]);
        $this->makeOrder($client, $deliverer, Order::STATUS_ANNULEE, 1000);
        $this->makeOrder($client, $deliverer, Order::STATUS_ACCEPTEE, 1500);
        OrderRelease::create(['order_id' => $done->id, 'deliverer_id' => $deliverer->id, 'reason' => 'panne']);
        Review::create(['order_id' => $done->id, 'client_id' => $client->id, 'deliverer_id' => $deliverer->id, 'rating' => 4, 'comment' => 'Rapide']);
        Commission::create([
            'order_id' => $done->id, 'beneficiary_id' => $deliverer->user_id, 'beneficiary_type' => 'livreur', 'rate' => 15,
            'order_amount' => 2000, 'commission_amount' => 300, 'net_amount' => 1700, 'status' => 'due',
        ]);
        $deliverer->refreshStats();

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/deliverers/{$deliverer->id}")->assertOk();

        $response->assertJsonPath('deliverer.vehicle_plate', 'AB-1234-RB')
            ->assertJsonPath('deliverer.emergency_phone', '+22901999999')
            ->assertJsonPath('user.email', $deliverer->user->email)
            ->assertJsonPath('stats.delivered', 1)
            ->assertJsonPath('stats.cancelled', 1)
            ->assertJsonPath('stats.in_progress', 1)
            ->assertJsonPath('stats.releases', 1)
            ->assertJsonPath('stats.releases_by_reason.panne', 1)
            ->assertJsonPath('stats.total_km', 5)
            ->assertJsonPath('stats.rating_distribution.4', 1)
            ->assertJsonPath('earnings.earned_total', 1700)
            ->assertJsonPath('earnings.commission_total', 300)
            ->assertJsonPath('earnings.balance_due', 1700)
            ->assertJsonPath('recent_reviews.0.comment', 'Rapide')
            ->assertJsonCount(3, 'recent_orders');
        // 1 livrée sur 4 courses prises (livrée + annulée + en cours + 1 désistement) = 25 %.
        $response->assertJsonPath('stats.completion_rate', 25);
        // Pas de fuite de la photo brute.
        $response->assertJsonMissingPath('user.avatar_path');

        $this->actingAs($this->makeUser('client'), 'sanctum')->getJson("/api/v1/admin/deliverers/{$deliverer->id}")->assertForbidden();
    }
}
