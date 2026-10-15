<?php

namespace Database\Seeders;

use App\Models\Deliverer;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

/**
 * Profils de test : deux comptes par catégorie (particulier, entreprise, livreur).
 * Relançable sans doublon (clé : e-mail). Mot de passe commun : ChangeMoi123!
 *
 *   php artisan db:seed --class=TestProfilesSeeder
 */
class TestProfilesSeeder extends Seeder
{
    private const PASSWORD = 'ChangeMoi123!';

    public function run(): void
    {
        $admin = User::where('role', 'admin')->first();

        $this->client('particulier1@livcorp.bj', '+22901000101', 'Awa', 'Adjovi', 'femme', 'Fidjrossè, Cotonou', 'particulier');
        $this->client('particulier2@livcorp.bj', '+22901000102', 'Koffi', 'Mensah', 'homme', 'Akpakpa, Cotonou', 'particulier');

        $this->client('entreprise1@livcorp.bj', '+22901000201', 'Rose', 'Dossou', 'femme', 'Cadjehoun, Cotonou', 'entreprise', 'Dossou Distribution');
        $this->client('entreprise2@livcorp.bj', '+22901000202', 'Yves', 'Agbo', 'homme', 'Haie Vive, Cotonou', 'entreprise', 'Agbo Pharma');

        // Agbo Pharma a négocié un tarif avec LIV corp (moins cher que le barème standard).
        User::where('email', 'entreprise2@livcorp.bj')->first()
            ?->forceFill(['custom_tariff' => ['base_fare' => 400, 'per_km' => 120, 'express_multiplier' => 1.3]])->save();

        // Livreurs déjà validés et disponibles, à des endroits différents de Cotonou.
        $this->deliverer('livreur1@livcorp.bj', '+22901000301', 'Moussa', 'Alassane', 'homme', 'Godomey', 'moto', 'AB-1234-RB', 6.3654, 2.4183, $admin);
        $this->deliverer('livreur2@livcorp.bj', '+22901000302', 'Prisca', 'Houngbo', 'femme', 'Cadjehoun', 'voiture', 'CD-5678-RB', 6.3520, 2.3620, $admin);

        // Un livreur sans photo de profil n'a pas accès à ses courses : image de remplacement (initiales) pour les tests.
        User::where('role', 'livreur')->whereNull('avatar_path')->get()->each(fn (User $u) => $this->placeholderAvatar($u));

        $this->command->info('Profils de test prêts (mot de passe : '.self::PASSWORD.')');
    }

    private function user(string $email, string $phone, string $first, string $last, string $sex, string $address, array $extra): User
    {
        return User::updateOrCreate(['email' => $email], array_merge([
            'role' => 'client',
            'first_name' => $first,
            'last_name' => $last,
            'sex' => $sex,
            'address' => $address,
            'phone' => $phone,
            'password' => Hash::make(self::PASSWORD),
            'email_verified_at' => now(),
            'is_active' => true,
        ], $extra));
    }

    private function client(string $email, string $phone, string $first, string $last, string $sex, string $address, string $type, ?string $company = null): void
    {
        $this->user($email, $phone, $first, $last, $sex, $address, ['account_type' => $type, 'company_name' => $company]);
    }

    private function deliverer(string $email, string $phone, string $first, string $last, string $sex, string $address, string $vehicle, string $plate, float $lat, float $lng, ?User $admin): void
    {
        $user = $this->user($email, $phone, $first, $last, $sex, $address, ['role' => 'livreur']);

        Deliverer::updateOrCreate(['user_id' => $user->id], [
            'verification_status' => 'approved',
            'vehicle_type' => $vehicle,
            'vehicle_plate' => $plate,
            'emergency_phone' => '+22901999999',
            'is_available' => true,
            'current_lat' => $lat,
            'current_lng' => $lng,
            'location_updated_at' => now(),
            'mobile_money_number' => $phone,
            'verified_at' => now(),
            'verified_by' => $admin?->id,
        ]);
    }

    /** Pastille colorée avec les initiales, enregistrée comme une vraie photo de profil. */
    private function placeholderAvatar(User $user): void
    {
        $size = 512;
        $img = imagecreatetruecolor($size, $size);
        $palette = [[245, 114, 30], [30, 94, 168], [46, 125, 90], [142, 68, 173]];
        [$r, $g, $b] = $palette[$user->id % count($palette)];
        imagefill($img, 0, 0, imagecolorallocate($img, $r, $g, $b));

        $initials = mb_strtoupper(mb_substr($user->first_name, 0, 1).mb_substr($user->last_name, 0, 1));
        $font = 5; // police GD intégrée, agrandie en recopiant sur une petite image
        $small = imagecreatetruecolor(24, 16);
        imagefill($small, 0, 0, imagecolorallocate($small, $r, $g, $b));
        imagestring($small, $font, 12 - (int) (imagefontwidth($font) * strlen($initials) / 2), 0, $initials, imagecolorallocate($small, 255, 255, 255));
        imagecopyresized($img, $small, 0, 96, 0, 0, $size, 320, 24, 16);

        ob_start();
        imagejpeg($img, null, 88);
        $path = 'avatars/seed-'.$user->id.'.jpg';
        Storage::disk('parcel_photos')->put($path, (string) ob_get_clean());

        $user->forceFill(['avatar_path' => $path])->save();
    }
}
