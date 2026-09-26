<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminMessagesTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        $user = User::create([
            'role' => $role,
            'first_name' => ucfirst($role),
            'last_name' => 'Test',
            'email' => $role.'@test.bj',
            'phone' => '+2290100'.random_int(1000, 9999),
            'is_active' => true,
            'password' => 'Passw0rdX',
        ]);
        $user->forceFill(['email_verified_at' => now()])->save();

        return $user;
    }

    private function message(array $overrides = []): ContactMessage
    {
        return ContactMessage::create(array_merge([
            'name' => 'Awa',
            'email' => 'awa@test.bj',
            'subject' => 'Question',
            'message' => 'Bonjour',
        ], $overrides));
    }

    public function test_public_contact_form_stores_a_new_message(): void
    {
        $this->postJson('/api/v1/contact', [
            'name' => 'Awa', 'email' => 'awa@test.bj', 'subject' => 'Question', 'message' => 'Bonjour',
        ])->assertCreated();

        $this->assertDatabaseHas('contact_messages', ['email' => 'awa@test.bj', 'status' => 'nouveau']);
    }

    public function test_admin_lists_messages_with_new_count_and_filter(): void
    {
        $this->message();
        $this->message(['status' => 'traite']);

        $this->actingAs($this->user('admin'), 'sanctum')
            ->getJson('/api/v1/admin/messages?status=nouveau')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('new_count', 1);

        $this->getJson('/api/v1/admin/messages')->assertJsonCount(2, 'data');
    }

    public function test_admin_marks_a_message_as_handled(): void
    {
        $message = $this->message();

        $this->actingAs($this->user('admin'), 'sanctum')
            ->patchJson("/api/v1/admin/messages/{$message->id}/status", ['status' => 'traite'])
            ->assertOk()
            ->assertJsonPath('status', 'traite');
    }

    public function test_non_admin_cannot_read_messages(): void
    {
        $this->message();

        $this->actingAs($this->user('client'), 'sanctum')->getJson('/api/v1/admin/messages')->assertForbidden();
    }

    public function test_guest_cannot_read_messages(): void
    {
        $this->getJson('/api/v1/admin/messages')->assertUnauthorized();
    }
}
