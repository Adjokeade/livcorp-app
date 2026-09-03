<?php

namespace Database\Seeders;

use App\Models\Deliverer;
use App\Models\Merchant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Compte administrateur par défaut
        $admin = User::create([
            'role' => 'admin',
            'first_name' => 'Admin',
            'last_name' => 'LIV corp',
            'email' => 'admin@livcorp.bj',
            'phone' => '+22900000000',
            'password' => Hash::make('ChangeMoi123!'),
            'email_verified_at' => now(),
        ]);

        // Client de démonstration
        $client = User::create([
            'role' => 'client',
            'first_name' => 'Amina',
            'last_name' => 'Client',
            'email' => 'client@livcorp.bj',
            'phone' => '+22900000001',
            'password' => Hash::make('ChangeMoi123!'),
            'email_verified_at' => now(),
        ]);

        // Livreur de démonstration (déjà validé, pour tester directement)
        $delivererUser = User::create([
            'role' => 'livreur',
            'first_name' => 'Karim',
            'last_name' => 'Livreur',
            'email' => 'livreur@livcorp.bj',
            'phone' => '+22900000002',
            'password' => Hash::make('ChangeMoi123!'),
            'email_verified_at' => now(),
        ]);

        Deliverer::create([
            'user_id' => $delivererUser->id,
            'verification_status' => 'approved',
            'vehicle_type' => 'moto',
            'is_available' => true,
            'mobile_money_number' => '+22900000002',
            'verified_at' => now(),
            'verified_by' => $admin->id,
        ]);

        // Commerçant de démonstration
        $merchantUser = User::create([
            'role' => 'commercant',
            'first_name' => 'Fatou',
            'last_name' => 'Commerçante',
            'email' => 'commercant@livcorp.bj',
            'phone' => '+22900000003',
            'password' => Hash::make('ChangeMoi123!'),
            'email_verified_at' => now(),
        ]);

        Merchant::create([
            'user_id' => $merchantUser->id,
            'shop_name' => 'Boutique Fatou',
            'shop_address' => 'Cotonou, quartier Fidjrossè',
            'verification_status' => 'approved',
            'verified_at' => now(),
            'verified_by' => $admin->id,
        ]);

        $this->command->info('Comptes de démonstration créés (mot de passe : ChangeMoi123!) :');
        $this->command->info('- admin@livcorp.bj');
        $this->command->info('- client@livcorp.bj');
        $this->command->info('- livreur@livcorp.bj');
        $this->command->info('- commercant@livcorp.bj');
    }
}
