<?php

namespace Tests\Feature;

use App\Models\Deliverer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsPlatformData;
use Tests\TestCase;

/** Photo de profil : obligatoire pour accéder aux courses d'un livreur. */
class AvatarTest extends TestCase
{
    use BuildsPlatformData;
    use RefreshDatabase;

    public function test_a_user_uploads_a_square_profile_photo_served_by_signed_url(): void
    {
        Storage::fake('parcel_photos');
        $user = $this->makeUser('client');

        $url = $this->actingAs($user, 'sanctum')
            ->post('/api/v1/profile/avatar', ['avatar' => UploadedFile::fake()->image('moi.jpg', 800, 400)], ['Accept' => 'application/json'])
            ->assertCreated()->json('avatar_url');

        $this->assertNotNull($url);
        $path = $user->fresh()->getRawOriginal('avatar_path');
        [$w, $h] = getimagesizefromstring(Storage::disk('parcel_photos')->get($path));
        $this->assertSame($w, $h);

        $this->get($url)->assertOk();
        $this->get(preg_replace('/signature=[^&]+/', 'signature=faux', $url))->assertForbidden();
    }

    public function test_the_raw_path_is_never_exposed(): void
    {
        $user = $this->makeUser('livreur');

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')
            ->assertOk()->assertJsonMissingPath('avatar_path')->assertJsonStructure(['avatar_url']);
    }

    public function test_a_deliverer_without_photo_cannot_reach_deliverer_routes(): void
    {
        $deliverer = $this->makeDeliverer();
        $deliverer->user->forceFill(['avatar_path' => null])->save();

        $this->actingAs($deliverer->user, 'sanctum')->getJson('/api/v1/deliverer/orders/available')
            ->assertForbidden()->assertJsonPath('code', 'avatar_required');

        $deliverer->user->forceFill(['avatar_path' => 'avatars/x.jpg'])->save();
        $this->actingAs($deliverer->user->fresh(), 'sanctum')->getJson('/api/v1/deliverer/orders/available')->assertOk();
    }

    public function test_a_deliverer_cannot_remove_their_photo_but_a_client_can(): void
    {
        Storage::fake('parcel_photos');
        $deliverer = $this->makeUser('livreur');
        $client = $this->makeUser('client');
        $client->forceFill(['avatar_path' => 'avatars/c.jpg'])->save();

        $this->actingAs($deliverer, 'sanctum')->deleteJson('/api/v1/profile/avatar')->assertUnprocessable();
        $this->actingAs($client, 'sanctum')->deleteJson('/api/v1/profile/avatar')->assertNoContent();
        $this->assertFalse($client->fresh()->hasAvatar());
    }

    public function test_admin_cannot_approve_a_deliverer_without_photo(): void
    {
        $admin = $this->makeUser('admin');
        $deliverer = $this->makeDeliverer('pending');
        $deliverer->user->forceFill(['avatar_path' => null])->save();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/deliverers/{$deliverer->id}/approve")->assertUnprocessable();
        $this->assertSame('pending', $deliverer->fresh()->verification_status);

        $deliverer->user->forceFill(['avatar_path' => 'avatars/x.jpg'])->save();
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/deliverers/{$deliverer->id}/approve")->assertOk();
    }

    public function test_a_client_sees_the_photo_of_their_deliverer_only(): void
    {
        $client = $this->makeUser('client');
        $deliverer = $this->makeDeliverer();
        $order = $this->makeOrder($client, $deliverer, 'acceptee');

        $this->actingAs($client, 'sanctum')->getJson("/api/v1/client/orders/{$order->id}")
            ->assertOk()->assertJsonStructure(['deliverer' => ['user' => ['avatar_url']]])
            ->assertJsonMissingPath('deliverer.user.avatar_path');

        // La page publique des annonces ne montre pas les visages.
        $this->getJson('/api/v1/marketplace/deliverers')->assertOk()->assertJsonMissingPath('data.0.avatar_url');
    }
}
