<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Connexion de l'espace administrateur, séparée de la connexion publique.
 *
 * Plus stricte que la connexion des clients et livreurs :
 *  - seuls les comptes administrateur actifs passent ;
 *  - une seule réponse d'échec ("Identifiants incorrects.") que le compte n'existe pas, que le mot de
 *    passe soit faux ou que le compte ne soit pas administrateur : on ne révèle jamais quels comptes
 *    sont des administrateurs ;
 *  - 5 essais par minute et par (adresse IP, e-mail) ;
 *  - session plus courte (8 h par défaut) ;
 *  - chaque connexion, réussie ou non, est journalisée.
 */
class AuthController extends Controller
{
    /** Hash bcrypt d'un mot de passe quelconque : compare quand même quelque chose si l'e-mail est inconnu. */
    private const DUMMY_HASH = '$2y$12$riLMFxdy4NHBbjb45Dj7pu3B5qXfE3G9fe0dOjPRIiBtSi47MfrNi';

    public function __construct(private readonly AuditLogService $auditLog) {}

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $key = 'admin-login:'.$request->ip().'|'.strtolower($credentials['email']);

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $this->auditLog->log('admin.login_blocked', null, ['email' => $credentials['email']]);

            throw ValidationException::withMessages([
                'email' => 'Trop de tentatives. Réessayez dans '.RateLimiter::availableIn($key).' secondes.',
            ]);
        }

        $user = User::where('email', $credentials['email'])->first();

        // Même travail (une vérification de hash) que le compte existe ou non : pas de différence de durée à exploiter.
        $passwordOk = Hash::check($credentials['password'], $user?->password ?? self::DUMMY_HASH);

        if (! $user || ! $passwordOk || $user->role !== 'admin' || ! $user->is_active) {
            RateLimiter::hit($key, 60);
            $this->auditLog->log('admin.login_failed', null, ['email' => $credentials['email']]);

            throw ValidationException::withMessages(['email' => 'Identifiants incorrects.']);
        }

        RateLimiter::clear($key);

        Auth::setUser($user); // pour que le journal d'audit attribue l'action à cet administrateur
        $user->update(['last_login_at' => now()]);
        $this->auditLog->log('admin.login', $user);

        $token = $user->createToken(
            name: 'admin '.($request->userAgent() ?? 'api'),
            expiresAt: now()->addMinutes((int) config('services.admin.token_minutes', 480)),
        );

        return response()->json(['user' => $user, 'token' => $token->plainTextToken]);
    }
}
