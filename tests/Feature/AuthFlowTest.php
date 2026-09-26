<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    private function particulier(array $overrides = []): array
    {
        return array_merge([
            'role' => 'client',
            'account_type' => 'particulier',
            'first_name' => 'Awa',
            'last_name' => 'Test',
            'sex' => 'femme',
            'address' => 'Cotonou',
            'email' => 'awa@test.bj',
            'phone' => '+22901000001',
            'password' => 'Passw0rdX',
            'password_confirmation' => 'Passw0rdX',
        ], $overrides);
    }

    private function livreur(array $overrides = []): array
    {
        return array_merge([
            'role' => 'livreur',
            'first_name' => 'Ali',
            'last_name' => 'Test',
            'sex' => 'homme',
            'address' => 'Cotonou',
            'emergency_phone' => '+22901000009',
            'vehicle_type' => 'moto',
            'vehicle_plate' => 'AB1234',
            'email' => 'ali@test.bj',
            'phone' => '+22901000003',
            'password' => 'Passw0rdX',
            'password_confirmation' => 'Passw0rdX',
        ], $overrides);
    }

    public function test_particulier_registers_then_logs_in(): void
    {
        $this->postJson('/api/v1/auth/register', $this->particulier())->assertCreated();

        $this->postJson('/api/v1/auth/login', ['email' => 'awa@test.bj', 'password' => 'Passw0rdX'])
            ->assertOk()
            ->assertJsonPath('user.account_type', 'particulier')
            ->assertJsonStructure(['token']);
    }

    public function test_entreprise_requires_company_name(): void
    {
        $payload = $this->particulier(['account_type' => 'entreprise', 'sex' => null]);

        $this->postJson('/api/v1/auth/register', $payload)->assertJsonValidationErrors('company_name');

        $this->postJson('/api/v1/auth/register', $payload + ['company_name' => 'Boulangerie Soleil'])->assertCreated();
    }

    public function test_livreur_registration_creates_a_pending_deliverer_profile(): void
    {
        $this->postJson('/api/v1/auth/register', $this->livreur())
            ->assertCreated()
            ->assertJsonPath('user.deliverer.verification_status', 'pending');
    }

    public function test_validation_errors_are_in_french(): void
    {
        $this->postJson('/api/v1/auth/register', $this->particulier(['email' => 'nope', 'password' => 'abc', 'password_confirmation' => 'abc']))
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'Le champ e-mail doit être une adresse e-mail valide.');
    }

    public function test_duplicate_email_is_rejected(): void
    {
        $this->postJson('/api/v1/auth/register', $this->particulier())->assertCreated();

        $this->postJson('/api/v1/auth/register', $this->particulier(['phone' => '+22901000002']))
            ->assertJsonValidationErrors('email');
    }

    public function test_wrong_password_is_rejected(): void
    {
        $this->postJson('/api/v1/auth/register', $this->particulier())->assertCreated();

        $this->postJson('/api/v1/auth/login', ['email' => 'awa@test.bj', 'password' => 'mauvais'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'Identifiants incorrects.');
    }

    public function test_accounts_are_verified_at_once_when_verification_is_disabled(): void
    {
        config(['app.email_verification_required' => false]);
        $this->postJson('/api/v1/auth/register', $this->particulier())->assertCreated();

        $this->assertNotNull(User::where('email', 'awa@test.bj')->value('email_verified_at'));
    }

    public function test_unverified_client_cannot_order_when_verification_is_required(): void
    {
        config(['app.email_verification_required' => true]);
        $this->postJson('/api/v1/auth/register', $this->particulier())->assertCreated();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'awa@test.bj', 'password' => 'Passw0rdX'])->json('token');

        $this->withToken($token)->getJson('/api/v1/client/orders')->assertForbidden();
    }

    public function test_livreur_can_upload_documents_before_validation(): void
    {
        Storage::fake('documents_private');
        $this->postJson('/api/v1/auth/register', $this->livreur())->assertCreated();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'ali@test.bj', 'password' => 'Passw0rdX'])->json('token');

        $this->withToken($token)->postJson('/api/v1/deliverer/documents', [
            'id_card' => UploadedFile::fake()->image('cni.png'),
            'driving_license' => UploadedFile::fake()->create('permis.pdf', 100, 'application/pdf'),
        ])->assertCreated()->assertJsonCount(2, 'documents');

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertJsonCount(2, 'documents')
            ->assertJsonMissingPath('documents.0.path');
    }

    public function test_document_upload_requires_at_least_one_file(): void
    {
        Storage::fake('documents_private');
        $this->postJson('/api/v1/auth/register', $this->livreur())->assertCreated();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'ali@test.bj', 'password' => 'Passw0rdX'])->json('token');

        $this->withToken($token)->postJson('/api/v1/deliverer/documents', [])->assertUnprocessable();
    }

    public function test_document_upload_is_reserved_to_livreurs(): void
    {
        Storage::fake('documents_private');
        $this->postJson('/api/v1/auth/register', $this->particulier())->assertCreated();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'awa@test.bj', 'password' => 'Passw0rdX'])->json('token');

        $this->withToken($token)->postJson('/api/v1/deliverer/documents', [
            'id_card' => UploadedFile::fake()->image('cni.png'),
        ])->assertForbidden();
    }
}
