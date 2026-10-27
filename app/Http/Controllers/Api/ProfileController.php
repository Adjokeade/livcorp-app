<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Profil de l'utilisateur connecté (tous rôles). L'e-mail et le rôle ne se
 * modifient pas ici : l'e-mail doit être revérifié, le rôle est définitif.
 */
class ProfileController extends Controller
{
    public function update(Request $request)
    {
        $user = $request->user();
        $isEntreprise = $user->role === 'client' && in_array($user->account_type, ['entreprise', 'conciergerie'], true);

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'company_name' => [Rule::requiredIf($isEntreprise), 'nullable', 'string', 'max:150'],
            'sex' => 'nullable|in:homme,femme',
            'phone' => ['required', 'string', 'max:20', Rule::unique('users', 'phone')->ignore($user->id)],
            'address' => 'nullable|string|max:255',
        ]);

        // Le nom d'entreprise n'a de sens que pour un compte entreprise.
        if (! $isEntreprise) {
            unset($validated['company_name']);
        }

        $user->update($validated);

        return $user->fresh()->load([
            'deliverer',
            'merchant',
            'documents' => fn ($q) => $q->select('id', 'user_id', 'type', 'status'),
        ]);
    }

    public function updatePassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => 'required|string',
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Mot de passe actuel incorrect.']);
        }

        $user->update(['password' => $validated['password']]);

        // Les autres appareils doivent se reconnecter ; la session courante reste valide.
        $current = $user->currentAccessToken();
        $user->tokens()->when($current instanceof PersonalAccessToken, fn ($q) => $q->where('id', '!=', $current->id))->delete();

        return response()->json(['message' => 'Mot de passe modifié.']);
    }
}
