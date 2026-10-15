<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Envoi d'e-mails : silencieux par défaut, actif seulement avec MAIL_ENABLED. */
class MailSwitchTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    public function test_sending_is_silent_by_default(): void
    {
        $this->assertFalse(config('mail.enabled'));
        $this->assertSame('log', config('mail.default'));
        $this->artisan('mail:status')->expectsOutputToContain('SILENCIEUX')->assertSuccessful();
    }

    public function test_the_test_command_does_not_send_anything_while_silent(): void
    {
        $this->artisan('mail:test', ['to' => 'quelquun@example.com'])
            ->expectsOutputToContain('aucun envoi réel')
            ->assertSuccessful();
    }

    public function test_the_forgot_password_answer_tells_the_interface_whether_mail_is_active(): void
    {
        $user = $this->makeUser('client');

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertStatus(202)->assertJsonPath('mail_enabled', false);

        config(['mail.enabled' => true]);
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'inconnu@example.com'])->assertStatus(202)->assertJsonPath('mail_enabled', true);
    }
}
