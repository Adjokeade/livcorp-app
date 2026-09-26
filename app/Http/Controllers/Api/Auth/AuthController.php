<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Deliverer;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function register(Request $request)
    {
        $isEntreprise = $request->input('role') === 'client' && $request->input('account_type') === 'entreprise';
        $isParticulier = $request->input('role') === 'client' && $request->input('account_type') === 'particulier';

        $validated = $request->validate([
            'role' => 'required|in:client,commercant,livreur',
            // L'expéditeur (role "client") se déclare entreprise ou particulier
            // dès l'inscription — cf. cahier des charges "Parcours de
            // l'expéditeur", étape 1. Sans objet pour commerçant/livreur.
            'account_type' => [Rule::requiredIf($request->input('role') === 'client'), 'nullable', 'in:entreprise,particulier'],
            'company_name' => [Rule::requiredIf($isEntreprise), 'nullable', 'string', 'max:150'],
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'sex' => [Rule::requiredIf($isParticulier || $request->input('role') === 'livreur'), 'nullable', 'in:homme,femme'],
            'address' => 'nullable|required_if:role,livreur|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'phone' => 'required|string|max:20|unique:users,phone',
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
            // Champs propres au livreur (cf. cahier des charges "Parcours du livreur", étape 1)
            'emergency_phone' => 'nullable|required_if:role,livreur|string|max:20',
            'vehicle_type' => 'nullable|in:moto,velo,voiture,a_pied',
            'vehicle_plate' => 'nullable|string|max:20',
        ]);

        // "address" est aussi requise pour un expéditeur (entreprise ou
        // particulier), mais required_if ne gère qu'une seule valeur : on le
        // vérifie ici plutôt que d'alourdir la règle ci-dessus.
        if ($request->input('role') === 'client' && ! $request->filled('address')) {
            throw ValidationException::withMessages(['address' => 'Le champ adresse est obligatoire.']);
        }

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([
                'role' => $validated['role'],
                'account_type' => $validated['account_type'] ?? null,
                'company_name' => $validated['company_name'] ?? null,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'sex' => $validated['sex'] ?? null,
                'address' => $validated['address'] ?? null,
                'email' => $validated['email'],
                'phone' => $validated['phone'],
                'password' => Hash::make($validated['password']),
            ]);

            if (! config('app.email_verification_required')) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }

            // Sans ce profil, le livreur reste bloqué par le middleware
            // deliverer.verified sans jamais pouvoir passer par la validation
            // admin (cf. cahier des charges "Parcours du livreur", étape 2).
            if ($user->role === 'livreur') {
                Deliverer::create([
                    'user_id' => $user->id,
                    'emergency_phone' => $validated['emergency_phone'] ?? null,
                    'vehicle_type' => $validated['vehicle_type'] ?? 'moto',
                    'vehicle_plate' => $validated['vehicle_plate'] ?? null,
                ]);
            }

            return $user;
        });

        // L'e-mail de vérification ne doit jamais faire échouer l'inscription
        // (SMTP indisponible, etc.) : le client peut le redemander via
        // POST /auth/email/verification-notification.
        try {
            if (config('app.email_verification_required')) {
                $user->sendEmailVerificationNotification();
            }
        } catch (\Throwable $e) {
            Log::warning('Envoi de l\'e-mail de vérification échoué à l\'inscription.', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->auditLog->log('user.registered', $user);

        return response()->json([
            'message' => config('app.email_verification_required')
                ? 'Compte créé. Vérifiez votre e-mail pour l\'activer.'
                : 'Compte créé.',
            'user' => $user->load('deliverer'),
        ], 201);
    }

    /**
     * Cible du lien reçu par e-mail (route signée "verification.verify").
     * Marque l'adresse comme vérifiée puis renvoie vers la SPA.
     */
    public function verifyEmail(Request $request, string $id, string $hash)
    {
        $user = User::findOrFail($id);

        if (! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            abort(403, 'Lien de vérification invalide.');
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
            $this->auditLog->log('user.email_verified', $user);
        }

        return redirect()->away(config('app.frontend_url').'/connexion?verified=1');
    }

    /**
     * Renvoi de l'e-mail de vérification (utilisateur authentifié mais non vérifié).
     */
    public function sendVerificationEmail(Request $request)
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Adresse déjà vérifiée.'], 200);
        }

        $user->sendEmailVerificationNotification();

        return response()->json(['message' => 'E-mail de vérification renvoyé.'], 202);
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

        // Les administrateurs ont leur propre point d'entrée (Admin\AuthController), plus strict.
        if ($user->role === 'admin') {
            Auth::logout();
            $this->auditLog->log('admin.login_wrong_entry', $user);

            return response()->json(['message' => 'Ce compte ne peut pas se connecter ici.'], 403);
        }

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
            // Même forme que /auth/me : le front s'appuie sur le profil livreur (statut de validation, pièces)
            // dès la connexion, sans laisser croire à un livreur validé que son dossier est incomplet.
            'user' => $user->load([
                'deliverer',
                'merchant',
                'documents' => fn ($q) => $q->select('id', 'user_id', 'type', 'status'),
            ]),
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
        // "path" reste côté serveur : on n'expose que le type et le statut des pièces.
        return response()->json($request->user()->load([
            'deliverer',
            'merchant',
            'documents' => fn ($q) => $q->select('id', 'user_id', 'type', 'status'),
        ]));
    }
}
