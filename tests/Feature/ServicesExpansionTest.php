<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\ServiceProvider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Certificat de résidence du livreur, comptes conciergerie et inscription des prestataires de services. */
class ServicesExpansionTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::create([
            'role' => 'admin', 'first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin@test.bj',
            'phone' => '+22901999999', 'is_active' => true, 'password' => 'Passw0rdX',
        ]);
        $admin->forceFill(['email_verified_at' => now()])->save();

        return $admin;
    }

    private function conciergerie(array $overrides = []): array
    {
        return array_merge([
            'role' => 'client',
            'account_type' => 'conciergerie',
            'company_name' => 'Conciergerie Soleil',
            'first_name' => 'Koffi',
            'last_name' => 'Gérant',
            'address' => 'Cotonou, Haie Vive',
            'email' => 'soleil@test.bj',
            'phone' => '+22901000050',
            'password' => 'Passw0rdX',
            'password_confirmation' => 'Passw0rdX',
        ], $overrides);
    }

    private function provider(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Paul',
            'last_name' => 'Plombier',
            'sex' => 'homme',
            'email' => 'paul@test.bj',
            'phone' => '+22901000060',
            'profession' => 'plombier',
            'city' => 'Cotonou',
            'experience_years' => 6,
            'description' => 'Dépannage et installation sanitaire, fuites, chauffe-eau.',
        ], $overrides);
    }

    // --- Certificat de résidence ---

    public function test_deliverer_can_upload_a_residence_certificate(): void
    {
        Storage::fake('documents_private');
        $user = User::create([
            'role' => 'livreur', 'first_name' => 'Ali', 'last_name' => 'T', 'email' => 'ali@test.bj',
            'phone' => '+22901000070', 'is_active' => true, 'password' => 'Passw0rdX',
        ]);
        $user->deliverer()->create([]);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/deliverer/documents', [
            'residence_certificate' => UploadedFile::fake()->create('residence.pdf', 100, 'application/pdf'),
        ])->assertCreated()->assertJsonPath('documents.0.type', 'certificat_residence');

        $this->assertSame(1, Document::where('type', 'certificat_residence')->count());
    }

    public function test_residence_certificate_only_replaces_its_own_previous_version(): void
    {
        Storage::fake('documents_private');
        $user = User::create([
            'role' => 'livreur', 'first_name' => 'Ali', 'last_name' => 'T', 'email' => 'ali@test.bj',
            'phone' => '+22901000070', 'is_active' => true, 'password' => 'Passw0rdX',
        ]);
        $user->deliverer()->create([]);
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/deliverer/documents', [
            'id_card' => UploadedFile::fake()->image('cni.png'),
            'residence_certificate' => UploadedFile::fake()->image('old.png'),
        ])->assertCreated();
        $this->postJson('/api/v1/deliverer/documents', [
            'residence_certificate' => UploadedFile::fake()->image('new.png'),
        ])->assertCreated();

        $this->assertSame(1, Document::where('type', 'certificat_residence')->count());
        $this->assertSame(1, Document::where('type', 'piece_identite')->count());
    }

    public function test_residence_certificate_rejects_wrong_file_types(): void
    {
        Storage::fake('documents_private');
        $user = User::create([
            'role' => 'livreur', 'first_name' => 'Ali', 'last_name' => 'T', 'email' => 'ali@test.bj',
            'phone' => '+22901000070', 'is_active' => true, 'password' => 'Passw0rdX',
        ]);
        $user->deliverer()->create([]);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/deliverer/documents', [
            'residence_certificate' => UploadedFile::fake()->create('virus.exe', 10, 'application/octet-stream'),
        ])->assertUnprocessable()->assertJsonValidationErrors('residence_certificate');
    }

    // --- Conciergerie ---

    public function test_conciergerie_registers_with_a_company_name_and_logs_in(): void
    {
        $this->postJson('/api/v1/auth/register', $this->conciergerie())->assertCreated()
            ->assertJsonPath('user.account_type', 'conciergerie');

        $this->postJson('/api/v1/auth/login', ['email' => 'soleil@test.bj', 'password' => 'Passw0rdX', 'category' => 'conciergerie'])
            ->assertOk()->assertJsonPath('user.company_name', 'Conciergerie Soleil');
    }

    public function test_conciergerie_requires_a_company_name_but_no_sex(): void
    {
        $this->postJson('/api/v1/auth/register', $this->conciergerie(['company_name' => '']))
            ->assertUnprocessable()->assertJsonValidationErrors('company_name');

        $this->postJson('/api/v1/auth/register', $this->conciergerie(['sex' => null]))->assertCreated();
    }

    public function test_conciergerie_login_category_must_match(): void
    {
        $this->postJson('/api/v1/auth/register', $this->conciergerie())->assertCreated();
        $creds = ['email' => 'soleil@test.bj', 'password' => 'Passw0rdX'];

        $this->postJson('/api/v1/auth/login', $creds + ['category' => 'particulier'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', $creds + ['category' => 'entreprise'])->assertUnprocessable();
    }

    public function test_unknown_account_type_is_refused(): void
    {
        $this->postJson('/api/v1/auth/register', $this->conciergerie(['account_type' => 'hotel']))
            ->assertUnprocessable()->assertJsonValidationErrors('account_type');
    }

    public function test_conciergerie_can_edit_its_company_name_and_has_no_batch_sending(): void
    {
        $this->postJson('/api/v1/auth/register', $this->conciergerie())->assertCreated();
        $user = User::where('email', 'soleil@test.bj')->first();
        $this->actingAs($user, 'sanctum');

        $this->patchJson('/api/v1/profile', [
            'first_name' => 'Koffi', 'last_name' => 'Gérant', 'phone' => '+22901000050', 'company_name' => 'Soleil Plus',
        ])->assertOk()->assertJsonPath('company_name', 'Soleil Plus');

        $this->postJson('/api/v1/client/orders/batch', [])->assertForbidden();
    }

    public function test_admin_can_filter_users_by_conciergerie(): void
    {
        $this->postJson('/api/v1/auth/register', $this->conciergerie())->assertCreated();
        $this->postJson('/api/v1/auth/register', $this->conciergerie(['email' => 'p@test.bj', 'phone' => '+22901000051', 'account_type' => 'particulier', 'sex' => 'homme', 'company_name' => null]))->assertCreated();

        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/users?account_type=conciergerie')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.company_name', 'Conciergerie Soleil');
    }

    // --- Prestataires de services ---

    public function test_anyone_can_list_professions(): void
    {
        $this->getJson('/api/v1/service-providers/professions')->assertOk()
            ->assertJsonFragment(['value' => 'plombier', 'label' => 'Plombier'])
            ->assertJsonFragment(['value' => 'coiffeur'])
            ->assertJsonFragment(['value' => 'informaticien']);
    }

    public function test_provider_applies_without_an_account(): void
    {
        $this->postJson('/api/v1/service-providers', $this->provider())->assertCreated();

        $this->assertDatabaseHas('service_providers', ['phone' => '+22901000060', 'status' => 'pending', 'profession' => 'plombier']);
    }

    public function test_provider_application_is_validated(): void
    {
        $this->postJson('/api/v1/service-providers', [])->assertUnprocessable()
            ->assertJsonValidationErrors(['first_name', 'last_name', 'phone', 'profession', 'city', 'experience_years', 'description']);

        $this->postJson('/api/v1/service-providers', $this->provider(['profession' => 'sorcier']))->assertUnprocessable()->assertJsonValidationErrors('profession');
        $this->postJson('/api/v1/service-providers', $this->provider(['profession' => 'autre']))->assertUnprocessable()->assertJsonValidationErrors('profession_other');
        $this->postJson('/api/v1/service-providers', $this->provider(['description' => 'trop court']))->assertUnprocessable()->assertJsonValidationErrors('description');
        $this->postJson('/api/v1/service-providers', $this->provider(['experience_years' => -1]))->assertUnprocessable()->assertJsonValidationErrors('experience_years');
    }

    public function test_other_profession_keeps_its_label_and_known_ones_drop_it(): void
    {
        $this->postJson('/api/v1/service-providers', $this->provider(['profession' => 'autre', 'profession_other' => 'Photographe']))->assertCreated();
        $this->postJson('/api/v1/service-providers', $this->provider(['phone' => '+22901000061', 'profession_other' => 'Ignoré']))->assertCreated();

        $this->assertSame('Photographe', ServiceProvider::where('profession', 'autre')->value('profession_other'));
        $this->assertNull(ServiceProvider::where('profession', 'plombier')->value('profession_other'));
    }

    public function test_same_phone_cannot_apply_twice_unless_refused(): void
    {
        $this->postJson('/api/v1/service-providers', $this->provider())->assertCreated();
        $this->postJson('/api/v1/service-providers', $this->provider())->assertUnprocessable()->assertJsonValidationErrors('phone');

        ServiceProvider::query()->update(['status' => 'rejected']);
        $this->postJson('/api/v1/service-providers', $this->provider())->assertCreated();
    }

    public function test_admin_reviews_provider_applications(): void
    {
        $this->postJson('/api/v1/service-providers', $this->provider())->assertCreated();
        $this->postJson('/api/v1/service-providers', $this->provider(['phone' => '+22901000062', 'first_name' => 'Rose', 'profession' => 'coiffeur']))->assertCreated();
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/admin/service-providers?status=pending')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/admin/service-providers?profession=coiffeur')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.first_name', 'Rose');
        $this->getJson('/api/v1/admin/service-providers?q=Rose')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/dashboard/stats')->assertOk()->assertJsonPath('pending_providers', 2);

        $paul = ServiceProvider::where('first_name', 'Paul')->first();
        $this->postJson("/api/v1/admin/service-providers/{$paul->id}/approve")->assertOk()->assertJsonPath('status', 'approved');
        $this->assertSame($admin->id, $paul->fresh()->reviewed_by);

        $rose = ServiceProvider::where('first_name', 'Rose')->first();
        $this->postJson("/api/v1/admin/service-providers/{$rose->id}/reject", [])->assertUnprocessable();
        $this->postJson("/api/v1/admin/service-providers/{$rose->id}/reject", ['reason' => 'Dossier incomplet'])
            ->assertOk()->assertJsonPath('status', 'rejected')->assertJsonPath('rejection_reason', 'Dossier incomplet');

        $this->getJson('/api/v1/admin/dashboard/stats')->assertJsonPath('pending_providers', 0);
        $this->assertDatabaseHas('audit_logs', ['action' => 'service_provider.approved']);
    }

    public function test_provider_admin_area_is_closed_to_others(): void
    {
        $this->postJson('/api/v1/service-providers', $this->provider())->assertCreated();
        $id = ServiceProvider::value('id');

        $this->getJson('/api/v1/admin/service-providers')->assertUnauthorized();
        $this->postJson("/api/v1/admin/service-providers/{$id}/approve")->assertUnauthorized();

        $this->postJson('/api/v1/auth/register', $this->conciergerie())->assertCreated();
        $this->actingAs(User::where('email', 'soleil@test.bj')->first(), 'sanctum');
        $this->getJson('/api/v1/admin/service-providers')->assertForbidden();
        $this->postJson("/api/v1/admin/service-providers/{$id}/approve")->assertForbidden();
        $this->assertSame('pending', ServiceProvider::find($id)->status);
    }
}
