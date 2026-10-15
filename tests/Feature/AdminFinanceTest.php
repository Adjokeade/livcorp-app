<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Order;
use App\Models\Payout;
use App\Services\CommissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Finances de la plateforme : commissions, soldes, versements, taux de commission modifiable. */
class AdminFinanceTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function commission($deliverer, float $amount, string $method, string $status = 'due'): Commission
    {
        $order = $this->makeOrder($this->makeUser('client'), $deliverer, Order::STATUS_LIVREE, $amount, $method);
        $commission = app(CommissionService::class)->computeForDeliveredOrder($order);
        $commission->update(['status' => $status]);

        return $commission;
    }

    public function test_finance_is_closed_to_non_admins(): void
    {
        $client = $this->makeUser('client');

        foreach (['summary', 'commissions', 'payouts', 'settings'] as $path) {
            $this->actingAs($client, 'sanctum')->getJson("/api/v1/admin/finance/{$path}")->assertForbidden();
        }
        $this->actingAs($client, 'sanctum')->postJson('/api/v1/admin/finance/payouts/run')->assertForbidden();
    }

    public function test_the_summary_separates_online_and_cash_flows(): void
    {
        $deliverer = $this->makeDeliverer();
        $this->commission($deliverer, 2000, 'en_ligne');   // LIV corp doit 1 700 au livreur, commission 300
        $this->commission($deliverer, 1000, 'especes');    // le livreur doit 150 à LIV corp, commission 150

        $this->actingAs($this->makeUser('admin'), 'sanctum')->getJson('/api/v1/admin/finance/summary?period=all')
            ->assertOk()
            ->assertJsonPath('deliveries', 2)
            ->assertJsonPath('volume', 3000)
            ->assertJsonPath('commission_total', 450)
            ->assertJsonPath('volume_online', 2000)
            ->assertJsonPath('volume_cash', 1000)
            ->assertJsonPath('owed_to_deliverers', 1700)
            ->assertJsonPath('owed_by_deliverers', 150)
            ->assertJsonPath('commission_rate', 15)
            ->assertJsonPath('top_balances.0.balance', 1550); // 1 700 − 150 : net du livreur
    }

    public function test_commissions_and_payouts_are_listed_with_filters(): void
    {
        $deliverer = $this->makeDeliverer();
        $this->commission($deliverer, 2000, 'en_ligne', 'paid');
        $this->commission($deliverer, 1000, 'especes');
        Payout::create(['beneficiary_id' => $deliverer->user_id, 'beneficiary_type' => 'livreur', 'total_amount' => 1700, 'period_type' => 'hebdomadaire',
            'period_start' => now()->startOfWeek(), 'period_end' => now(), 'status' => 'failed', 'mobile_money_number' => '+22901000301']);
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/finance/commissions')->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/finance/commissions?kind=especes')->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'especes');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/finance/commissions?status=paid')->assertJsonCount(1, 'data');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/finance/payouts?status=failed')->assertJsonCount(1, 'data');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/finance/payouts?status=paid')->assertJsonCount(0, 'data');
    }

    public function test_the_commission_rate_is_editable_and_only_applies_to_future_deliveries(): void
    {
        $deliverer = $this->makeDeliverer();
        $before = $this->commission($deliverer, 2000, 'en_ligne');
        $this->assertSame(300.0, (float) $before->commission_amount);

        $this->actingAs($this->makeUser('admin'), 'sanctum')->putJson('/api/v1/admin/finance/settings', ['commission_rate' => 20])
            ->assertOk()->assertJsonPath('commission_rate', 20);

        $after = $this->commission($deliverer, 2000, 'en_ligne');
        $this->assertSame(400.0, (float) $after->commission_amount);
        $this->assertEquals(20, $after->rate);
        // La commission déjà enregistrée garde son taux d'origine.
        $this->assertSame(300.0, (float) $before->fresh()->commission_amount);

        // Le livreur voit le nouveau taux dans son portefeuille.
        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/wallet')->assertJsonPath('commission_rate', 20);
    }

    public function test_the_commission_rate_is_bounded(): void
    {
        $admin = $this->makeUser('admin');

        foreach ([-1, 51, 'abc'] as $bad) {
            $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/finance/settings', ['commission_rate' => $bad])->assertUnprocessable();
        }
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/finance/settings', ['commission_rate' => 0])->assertOk();
    }

    public function test_payouts_can_be_launched_on_demand(): void
    {
        Bus::fake();

        $this->actingAs($this->makeUser('admin'), 'sanctum')->postJson('/api/v1/admin/finance/payouts/run')->assertStatus(202);

        Bus::assertDispatched(\App\Jobs\ProcessScheduledPayouts::class);
    }

    public function test_the_deliverer_directory_exposes_documents_so_the_admin_can_open_them(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->user->documents()->create(['type' => 'piece_identite', 'path' => 'user-1/cni.jpg', 'status' => 'pending']);

        $this->actingAs($this->makeUser('admin'), 'sanctum')->getJson('/api/v1/admin/deliverers')
            ->assertOk()->assertJsonPath('data.0.user.documents.0.type', 'piece_identite');
    }
}
