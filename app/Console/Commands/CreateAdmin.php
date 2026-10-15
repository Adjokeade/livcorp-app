<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Crée un compte administrateur. Le mot de passe est demandé en saisie masquée : il ne passe ni par
 * l'historique du terminal ni par un fichier.
 *
 *   php artisan admin:create vous@exemple.com --first-name=Marcel --last-name=Houénou --phone=+22997000000
 */
class CreateAdmin extends Command
{
    protected $signature = 'admin:create {email} {--first-name=Admin} {--last-name=LIV corp} {--phone=}';

    protected $description = 'Crée un compte administrateur (mot de passe demandé en saisie masquée)';

    public function handle(): int
    {
        $password = $this->secret('Mot de passe (8 caractères minimum, majuscule, minuscule et chiffre)');
        $confirmation = $this->secret('Confirmez le mot de passe');

        $validator = Validator::make([
            'email' => $this->argument('email'),
            'phone' => $this->option('phone') ?: null,
            'password' => $password,
            'password_confirmation' => $confirmation,
        ], [
            'email' => 'required|email|unique:users,email',
            'phone' => 'nullable|string|max:20|unique:users,phone',
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::create([
            'role' => 'admin',
            'first_name' => $this->option('first-name'),
            'last_name' => $this->option('last-name'),
            // Le téléphone est unique et obligatoire en base : numéro provisoire si aucun n'est donné.
            'phone' => $this->option('phone') ?: '+2290'.random_int(10000000, 99999999),
            'email' => $this->argument('email'),
            'password' => Hash::make($password),
        ]);
        $user->forceFill(['email_verified_at' => now()])->save();

        $this->info("Compte administrateur créé : {$user->email}");
        $this->line('Connexion : /admin/connexion');

        return self::SUCCESS;
    }
}
