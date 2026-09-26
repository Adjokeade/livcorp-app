<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/**
 * L'espace administrateur a son propre point d'entrée, plus strict que la connexion publique.
 */
class AdminLoginTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function account(string $role, array $overrides = []): User
    {
        $user = $this->makeUser($role);
        $user->forceFill(['password' => bcrypt('MotDePasse123')] + $overrides)->save();

        return $user;
    }

    private function adminLogin(string $email, string $password = 'MotDePasse123')
    {
        return $this->postJson('/api/v1/admin/auth/login', ['email' => $email, 'password' => $password]);
    }

    public function test_an_administrator_logs_in_and_the_token_opens_the_back_office(): void
    {
        $admin = $this->account('admin');

        $token = $this->adminLogin($admin->email)
            ->assertOk()
            ->assertJsonPath('user.role', 'admin')
            ->json('token');

        $this->withToken($token)->getJson('/api/v1/admin/messages')->assertOk();
    }

    public function test_the_admin_session_is_shorter_than_a_customer_session(): void
    {
        $admin = $this->account('admin');
        $this->adminLogin($admin->email)->assertOk();

        $expires = PersonalAccessToken::first()->expires_at;
        $this->assertTrue($expires->between(now()->addMinutes(479), now()->addMinutes(481)), "expiration inattendue : {$expires}");
    }

    public function test_every_failure_gets_the_same_answer(): void
    {
        $admin = $this->account('admin');
        $client = $this->account('client');
        $inactive = $this->account('admin', ['is_active' => false]);

        $answers = collect([
            $this->adminLogin($admin->email, 'mauvais'),             // mauvais mot de passe
            $this->adminLogin('personne@test.bj'),                    // compte inconnu
            $this->adminLogin($client->email),                        // bon mot de passe, mais pas administrateur
            $this->adminLogin($inactive->email),                      // administrateur désactivé
        ]);

        foreach ($answers as $response) {
            $response->assertUnprocessable()->assertJsonPath('errors.email.0', 'Identifiants incorrects.');
        }
        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_a_customer_password_never_opens_an_admin_session(): void
    {
        $client = $this->account('client');

        $this->adminLogin($client->email)->assertUnprocessable();
        $this->assertSame(0, $client->tokens()->count());
    }

    public function test_attempts_are_limited(): void
    {
        RateLimiter::clear('admin-login:127.0.0.1|admin@test.bj');
        $admin = $this->account('admin', ['email' => 'admin@test.bj']);

        for ($i = 0; $i < 5; $i++) {
            $this->adminLogin($admin->email, 'mauvais')->assertUnprocessable();
        }

        // Même avec le bon mot de passe, le compte est verrouillé jusqu'à la fin de la minute.
        $this->adminLogin($admin->email)
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', fn ($message) => str_starts_with($message, 'Trop de tentatives'));
    }

    public function test_the_public_login_refuses_administrators(): void
    {
        $admin = $this->account('admin');

        $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'MotDePasse123'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Ce compte ne peut pas se connecter ici.')
            ->assertJsonMissingPath('token');

        $this->assertSame(0, $admin->tokens()->count());
    }

    public function test_the_public_login_still_works_for_customers(): void
    {
        $client = $this->account('client');

        $this->postJson('/api/v1/auth/login', ['email' => $client->email, 'password' => 'MotDePasse123'])
            ->assertOk()
            ->assertJsonStructure(['token']);
    }

    public function test_successes_and_failures_are_written_to_the_audit_log(): void
    {
        $admin = $this->account('admin');

        $this->adminLogin($admin->email, 'mauvais');
        $this->adminLogin($admin->email);

        $failed = AuditLog::where('action', 'admin.login_failed')->first();
        $this->assertSame($admin->email, $failed->meta['email']);
        $this->assertStringNotContainsString('mauvais', json_encode($failed->meta)); // jamais le mot de passe

        $this->assertSame($admin->id, AuditLog::where('action', 'admin.login')->first()->user_id);
    }
}
