<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Équipe d'entreprise (responsable / opérateur) et livreurs favoris. */
class TeamAndFavoritesTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function owner(): User
    {
        $user = $this->makeUser('client');
        $user->update(['account_type' => 'entreprise', 'company_name' => 'ACME']);

        return $user;
    }

    private function member(User $owner, string $teamRole): User
    {
        $m = $this->makeUser('client');
        $m->update(['account_type' => 'entreprise', 'company_id' => $owner->id, 'team_role' => $teamRole]);

        return $m;
    }

    private function orderFor(User $client, array $extra = []): Order
    {
        static $n = 0;
        $n++;

        return Order::create($extra + ['client_id' => $client->id, 'reference' => "LIV-X-{$n}", 'type' => 'colis',
            'pickup_address' => 'A', 'pickup_lat' => 6.36, 'pickup_lng' => 2.41, 'dropoff_address' => 'B', 'dropoff_lat' => 6.35,
            'dropoff_lng' => 2.36, 'recipient_name' => 'K', 'recipient_phone' => '1', 'distance_km' => 5, 'duration_min' => 10,
            'price' => 1000, 'price_suggested' => 1000, 'initial_price' => 1000, 'delivery_code' => '1234',
            'status' => 'creee', 'payment_status' => 'paye']);
    }

    public function test_owner_creates_a_team_member_who_can_log_in(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner, 'sanctum')->postJson('/api/v1/client/team', [
            'first_name' => 'Awa', 'last_name' => 'Sow', 'email' => 'awa@acme.bj', 'phone' => '+22901777777',
            'team_role' => 'operateur', 'password' => 'Passw0rdX',
        ])->assertCreated();

        $member = User::where('email', 'awa@acme.bj')->first();
        $this->assertSame($owner->id, $member->company_id);
        $this->assertSame('ACME', $member->company_name);

        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $this->postJson('/api/v1/auth/login', ['email' => 'awa@acme.bj', 'password' => 'Passw0rdX', 'category' => 'entreprise'])->assertOk();
    }

    public function test_operators_cannot_manage_the_team(): void
    {
        $owner = $this->owner();
        $operator = $this->member($owner, 'operateur');

        $this->actingAs($operator, 'sanctum')->getJson('/api/v1/client/team')->assertForbidden();
        $this->actingAs($operator, 'sanctum')->postJson('/api/v1/client/team', [])->assertForbidden();
    }

    public function test_manager_sees_all_company_orders_but_operator_only_their_own(): void
    {
        $owner = $this->owner();
        $manager = $this->member($owner, 'responsable');
        $op1 = $this->member($owner, 'operateur');
        $op2 = $this->member($owner, 'operateur');
        $outsider = $this->owner();
        $this->orderFor($op1);
        $this->orderFor($op2);
        $this->orderFor($outsider);

        $this->actingAs($owner, 'sanctum')->getJson('/api/v1/client/orders')->assertJsonCount(2, 'data');
        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/client/orders')->assertJsonCount(2, 'data');
        $this->actingAs($op1, 'sanctum')->getJson('/api/v1/client/orders')->assertJsonCount(1, 'data');
    }

    public function test_operator_cannot_open_a_colleagues_order_but_manager_can(): void
    {
        $owner = $this->owner();
        $op1 = $this->member($owner, 'operateur');
        $op2 = $this->member($owner, 'operateur');
        $order = $this->orderFor($op1);

        $this->actingAs($op2, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertForbidden();
        $this->actingAs($owner, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")->assertOk();
    }

    public function test_deactivating_a_member_revokes_their_access(): void
    {
        $owner = $this->owner();
        $op = $this->member($owner, 'operateur');
        $op->createToken('t');

        $this->actingAs($owner, 'sanctum')->patchJson("/api/v1/client/team/{$op->id}", ['is_active' => false])->assertOk();

        $this->assertSame(0, $op->tokens()->count());
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $this->postJson('/api/v1/auth/login', ['email' => $op->email, 'password' => 'Passw0rdX'])->assertForbidden();
        $this->actingAs($owner, 'sanctum')->patchJson("/api/v1/client/team/{$owner->id}", ['is_active' => false])->assertNotFound();
    }

    public function test_favorites_are_shared_by_the_team_and_need_a_real_delivery(): void
    {
        $owner = $this->owner();
        $op = $this->member($owner, 'operateur');
        $deliverer = $this->makeDeliverer();
        $order = $this->orderFor($op, ['deliverer_id' => $deliverer->id, 'status' => 'livree']);
        $free = $this->orderFor($op);

        $this->actingAs($op, 'sanctum')->postJson("/api/v1/client/orders/{$free->id}/favorite")->assertUnprocessable();
        $this->actingAs($op, 'sanctum')->postJson("/api/v1/client/orders/{$order->id}/favorite")->assertCreated();
        $this->actingAs($owner, 'sanctum')->getJson('/api/v1/client/favorites')->assertOk()->assertJsonCount(1);

        $this->actingAs($owner, 'sanctum')->deleteJson("/api/v1/client/favorites/{$deliverer->id}")->assertNoContent();
        $this->actingAs($op, 'sanctum')->getJson('/api/v1/client/favorites')->assertJsonCount(0);
    }

    public function test_favorites_first_orders_are_hidden_from_other_deliverers_until_the_window_ends(): void
    {
        $owner = $this->owner();
        $fav = $this->makeDeliverer();
        $other = $this->makeDeliverer();
        $owner->favoriteDeliverers()->attach($fav->id);
        $order = $this->orderFor($owner, ['priority_until' => now()->addMinutes(10), 'priority_owner_id' => $owner->id]);

        $this->actingAs($fav->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(1, 'data');
        $this->actingAs($other->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(0, 'data');
        $this->actingAs($other->user, 'sanctum')->postJson("/api/v1/deliverer/orders/{$order->id}/accept")->assertStatus(409);
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(0, 'data');

        $this->travel(11)->minutes();
        $this->actingAs($other->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/marketplace/orders')->assertJsonCount(1, 'data');
    }
}
