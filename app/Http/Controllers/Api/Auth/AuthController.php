<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function register(Request $request)
    {
        $validated = $request->validate([
            'role' => 'required|in:client,commercant,livreur',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255|unique:users,email',
            'phone' => 'required|string|max:20|unique:users,phone',
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        $user = User::create([
            ...$validated,
            'password' => Hash::make($validated['password']),
        ]);

        // TODO: déclencher l'envoi de l'e-mail de vérification via Brevo (Notification queued)
        $user->sendEmailVerificationNotification();

        $this->auditLog->log('user.registered', $user);

        return response()->json([
            'message' => 'Compte créé. Vérifiez votre e-mail pour l\'activer.',
            'user' => $user,
        ], 201);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        // Rate limiting anti brute-force — cf. exigence sécurité
        $throttleKey = 'login:'.$request->ip().'|'.$credentials['email'];
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            throw ValidationException::withMessages([
                'email' => 'Trop de tentatives. Réessayez dans '.RateLimiter::availableIn($throttleKey).' secondes.',
            ]);
        }

        if (! Auth::attempt($credentials)) {
            RateLimiter::hit($throttleKey, 60);
            throw ValidationException::withMessages(['email' => 'Identifiants incorrects.']);
        }

        RateLimiter::clear($throttleKey);

        /** @var User $user */
        $user = Auth::user();

        if (! $user->is_active) {
            Auth::logout();
            return response()->json(['message' => 'Compte désactivé.'], 403);
        }

        $user->update(['last_login_at' => now()]);
        $this->auditLog->log('user.login', $user);

        $token = $user->createToken(
            name: $request->userAgent() ?? 'api',
            expiresAt: now()->addMinutes((int) config('sanctum.token_expiration', 1440)),
        );

        return response()->json([
            'user' => $user,
            'token' => $token->plainTextToken,
        ]);
    }

    public function logout(Request $request)
    {
        $this->auditLog->log('user.logout', $request->user());
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Déconnecté.']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user()->load(['deliverer', 'merchant']));
    }
}
