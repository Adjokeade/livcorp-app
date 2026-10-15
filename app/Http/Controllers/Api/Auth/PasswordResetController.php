<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/**
 * Mot de passe oublié : demande du lien par e-mail, puis choix d'un nouveau mot de passe.
 *
 * La demande répond TOUJOURS la même chose, que l'adresse existe ou non : on ne révèle jamais quels e-mails ont un
 * compte. Les comptes administrateur sont exclus (ils ont leur propre procédure, plus stricte), comme les comptes
 * désactivés.
 */
class PasswordResetController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function forgot(Request $request)
    {
        $validated = $request->validate(['email' => 'required|email|max:255']);

        $user = User::where('email', $validated['email'])->first();

        if ($user && $user->role !== 'admin' && $user->is_active) {
            // Les erreurs (limite d'une demande par minute, SMTP…) ne doivent rien laisser deviner à l'appelant.
            rescue(fn () => Password::sendResetLink(['email' => $user->email]));
        }

        return response()->json([
            'message' => 'Si un compte existe pour cette adresse, un e-mail avec un lien de réinitialisation vient d\'être envoyé.',
            // Tant que l'envoi d'e-mails est silencieux, l'interface prévient l'utilisateur de ne pas attendre un message.
            'mail_enabled' => (bool) config('mail.enabled'),
        ], 202);
    }

    public function reset(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => ['required', 'confirmed', PasswordRule::min(8)->mixedCase()->numbers()],
        ]);

        $account = User::where('email', $validated['email'])->first();

        // Même réponse pour un jeton faux, périmé, déjà utilisé, un compte inconnu, désactivé ou administrateur.
        $status = ($account && $account->role !== 'admin' && $account->is_active)
            ? Password::reset(
                $request->only('email', 'password', 'password_confirmation', 'token'),
                function (User $user, string $password) {
                    $user->forceFill(['password' => $password])->save();
                    // Toutes les sessions ouvertes (appareil perdu, intrus) sont fermées.
                    $user->tokens()->delete();
                    event(new PasswordReset($user));
                    $this->auditLog->log('user.password_reset', $user);
                },
            )
            : Password::INVALID_TOKEN;

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'token' => 'Ce lien est invalide ou a expiré. Faites une nouvelle demande.',
            ]);
        }

        return response()->json(['message' => 'Mot de passe modifié. Vous pouvez vous connecter.']);
    }
}
