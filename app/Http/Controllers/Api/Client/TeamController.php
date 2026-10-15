<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Équipe d'une entreprise : le propriétaire et ses responsables créent des comptes pour leurs collaborateurs.
 * Un responsable voit toutes les livraisons de l'entreprise ; un opérateur ne voit que les siennes.
 * Les comptes ne sont jamais supprimés (leurs livraisons restent) : on les désactive.
 */
class TeamController extends Controller
{
    private const MAX_MEMBERS = 25;

    public function index(Request $request)
    {
        $this->ensureManager($request);
        $ownerId = $request->user()->companyOwnerId();

        return User::where('id', $ownerId)->orWhere('company_id', $ownerId)
            ->withCount('ordersAsClient as orders_count')
            ->orderByRaw('id = ? desc', [$ownerId])
            ->orderBy('first_name')
            ->get(['id', 'company_id', 'team_role', 'first_name', 'last_name', 'email', 'phone', 'is_active', 'last_login_at'])
            ->map(fn (User $u) => [
                ...$u->toArray(),
                'is_owner' => $u->id === $ownerId,
                'team_role' => $u->id === $ownerId ? 'responsable' : $u->team_role,
            ]);
    }

    public function store(Request $request)
    {
        $this->ensureManager($request);
        $owner = User::findOrFail($request->user()->companyOwnerId());

        abort_if(
            $owner->teamMembers()->count() >= self::MAX_MEMBERS,
            422,
            'Votre équipe a atteint la limite de '.self::MAX_MEMBERS.' collaborateurs.'
        );

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255|unique:users,email',
            'phone' => 'required|string|max:20|unique:users,phone',
            'team_role' => ['required', Rule::in(['responsable', 'operateur'])],
            // Mot de passe provisoire communiqué par le responsable ; le collaborateur le change ensuite depuis son profil.
            'password' => ['required', Password::min(8)->mixedCase()->numbers()],
        ]);

        $member = User::create([
            ...$validated,
            'role' => 'client',
            'account_type' => 'entreprise',
            'company_id' => $owner->id,
            'company_name' => $owner->company_name,
            'address' => $owner->address,
        ]);

        if (! config('app.email_verification_required')) {
            $member->forceFill(['email_verified_at' => now()])->save();
        } else {
            try {
                $member->sendEmailVerificationNotification();
            } catch (\Throwable $e) {
                Log::warning('E-mail de vérification du collaborateur non envoyé.', ['user_id' => $member->id, 'error' => $e->getMessage()]);
            }
        }

        return response()->json($member->only(['id', 'first_name', 'last_name', 'email', 'phone', 'team_role', 'is_active']), 201);
    }

    public function update(Request $request, User $member)
    {
        $this->ensureManager($request);
        $this->ensureEditable($request, $member);

        $validated = $request->validate([
            'team_role' => ['sometimes', Rule::in(['responsable', 'operateur'])],
            'is_active' => 'sometimes|boolean',
        ]);

        $member->update($validated);

        // Un compte désactivé perd ses sessions ouvertes immédiatement.
        if (array_key_exists('is_active', $validated) && ! $validated['is_active']) {
            $member->tokens()->delete();
        }

        return $member->only(['id', 'first_name', 'last_name', 'email', 'phone', 'team_role', 'is_active']);
    }

    private function ensureManager(Request $request): void
    {
        abort_unless($request->user()->isTeamManager(), 403, 'Réservé au propriétaire et aux responsables de l\'entreprise.');
    }

    /** Seuls les collaborateurs de cette entreprise se modifient, jamais le propriétaire ni soi-même. */
    private function ensureEditable(Request $request, User $member): void
    {
        abort_unless($member->company_id === $request->user()->companyOwnerId(), 404);
        abort_if($member->id === $request->user()->id, 422, 'Vous ne pouvez pas modifier votre propre compte ici.');
    }
}
