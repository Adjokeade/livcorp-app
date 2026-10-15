<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\PasswordResetLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Mot de passe oublié : lien par e-mail, usage unique, aucune fuite sur l'existence des comptes. */
class PasswordResetTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    private function request(string $email)
    {
        return $this->postJson('/api/v1/auth/forgot-password', ['email' => $email]);
    }

    public function test_a_known_account_receives_a_link_to_the_frontend(): void
    {
        Notification::fake();
        $user = $this->makeUser('client');

        $this->request($user->email)->assertStatus(202);

        Notification::assertSentTo($user, PasswordResetLink::class, function (PasswordResetLink $n) use ($user) {
            $url = $n->toMail($user)->actionUrl;

            return str_starts_with($url, config('app.frontend_url').'/reinitialiser-mot-de-passe?')
                && str_contains($url, 'token=') && str_contains($url, urlencode($user->email));
        });
    }

    public function test_the_answer_is_identical_for_unknown_admin_and_disabled_accounts(): void
    {
        Notification::fake();
        $known = $this->makeUser('client');
        $admin = $this->makeUser('admin');
        $disabled = $this->makeUser('client');
        $disabled->update(['is_active' => false]);

        $reference = $this->request($known->email)->assertStatus(202)->json();
        foreach (['personne@nulle-part.bj', $admin->email, $disabled->email] as $email) {
            $this->request($email)->assertStatus(202)->assertExactJson($reference);
        }

        Notification::assertSentTimes(PasswordResetLink::class, 1);
        Notification::assertNotSentTo([$admin, $disabled], PasswordResetLink::class);
    }

    public function test_the_password_is_changed_once_and_other_sessions_are_closed(): void
    {
        $user = $this->makeUser('client');
        $user->createToken('telephone');
        $token = Password::createToken($user);
        $payload = ['token' => $token, 'email' => $user->email, 'password' => 'NouveauPass1', 'password_confirmation' => 'NouveauPass1'];

        $this->postJson('/api/v1/auth/reset-password', $payload)->assertOk();

        $this->assertTrue(Hash::check('NouveauPass1', $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());

        // Le lien ne sert qu'une fois.
        $this->postJson('/api/v1/auth/reset-password', $payload)->assertUnprocessable()->assertJsonValidationErrors('token');
    }

    public function test_a_wrong_token_or_a_weak_password_is_refused(): void
    {
        $user = $this->makeUser('client');
        $good = Password::createToken($user);

        $this->postJson('/api/v1/auth/reset-password', ['token' => 'faux', 'email' => $user->email, 'password' => 'NouveauPass1', 'password_confirmation' => 'NouveauPass1'])
            ->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->postJson('/api/v1/auth/reset-password', ['token' => $good, 'email' => $user->email, 'password' => 'faible', 'password_confirmation' => 'faible'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertTrue(Hash::check('Passw0rdX', $user->fresh()->password));
    }

    public function test_an_administrator_cannot_reset_through_the_public_flow(): void
    {
        $admin = $this->makeUser('admin');
        $token = Password::createToken($admin);

        $this->postJson('/api/v1/auth/reset-password', ['token' => $token, 'email' => $admin->email, 'password' => 'NouveauPass1', 'password_confirmation' => 'NouveauPass1'])
            ->assertUnprocessable();
        $this->assertTrue(Hash::check('Passw0rdX', $admin->fresh()->password));
    }
}
