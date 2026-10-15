<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileAndAddressesTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $attrs = []): User
    {
        static $n = 0;
        $n++;

        $user = User::create(array_merge([
            'role' => 'client', 'account_type' => 'particulier', 'first_name' => 'Test', 'last_name' => 'User',
            'email' => "user{$n}@test.bj", 'phone' => '+2290100'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
            'password' => 'Passw0rdX',
        ], $attrs));
        $user->forceFill(['email_verified_at' => now()])->save();

        return $user;
    }

    public function test_profile_can_be_updated_but_not_email_or_role(): void
    {
        $user = $this->user();

        $this->actingAs($user)->patchJson('/api/v1/profile', [
            'first_name' => 'Nouveau', 'last_name' => 'Nom', 'phone' => '+22901999999',
            'address' => 'Cotonou', 'email' => 'autre@test.bj', 'role' => 'admin',
        ])->assertOk()->assertJsonPath('first_name', 'Nouveau');

        $user->refresh();
        $this->assertSame('client', $user->role);
        $this->assertNotSame('autre@test.bj', $user->email);
    }

    public function test_phone_must_stay_unique(): void
    {
        $other = $this->user(['phone' => '+22901111111']);
        $user = $this->user();

        $this->actingAs($user)->patchJson('/api/v1/profile', [
            'first_name' => 'A', 'last_name' => 'B', 'phone' => $other->phone,
        ])->assertUnprocessable()->assertJsonValidationErrors('phone');
    }

    public function test_company_name_is_required_only_for_entreprise(): void
    {
        $entreprise = $this->user(['account_type' => 'entreprise', 'company_name' => 'ACME']);
        $this->actingAs($entreprise)->patchJson('/api/v1/profile', [
            'first_name' => 'A', 'last_name' => 'B', 'phone' => $entreprise->phone,
        ])->assertUnprocessable()->assertJsonValidationErrors('company_name');
    }

    public function test_password_change_requires_the_current_password(): void
    {
        $user = $this->user();
        $new = ['password' => 'NouveauPass1', 'password_confirmation' => 'NouveauPass1'];

        $this->actingAs($user)->putJson('/api/v1/profile/password', $new + ['current_password' => 'faux'])
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $token = $user->createToken('t')->plainTextToken;
        $this->withToken($token)->putJson('/api/v1/profile/password', $new + ['current_password' => 'Passw0rdX'])->assertOk();
        $this->assertTrue(\Hash::check('NouveauPass1', $user->fresh()->password));
    }

    public function test_saved_addresses_are_private_and_localised(): void
    {
        $user = $this->user();
        $other = $this->user();
        $payload = ['label' => 'Domicile', 'address' => 'Fidjrossè, Cotonou', 'lat' => 6.35, 'lng' => 2.38];

        $id = $this->actingAs($user)->postJson('/api/v1/addresses', $payload)->assertCreated()->json('id');
        $this->actingAs($user)->getJson('/api/v1/addresses')->assertOk()->assertJsonCount(1);
        $this->actingAs($other)->getJson('/api/v1/addresses')->assertOk()->assertJsonCount(0);
        $this->actingAs($other)->deleteJson("/api/v1/addresses/{$id}")->assertNotFound();

        $this->actingAs($user)->postJson('/api/v1/addresses', ['lat' => 48.8, 'lng' => 2.3] + $payload)->assertUnprocessable();
        $this->actingAs($user)->deleteJson("/api/v1/addresses/{$id}")->assertNoContent();
    }
}
