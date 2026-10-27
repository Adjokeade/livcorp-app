<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/** Comptes utilisateurs : recherche, et activation / désactivation (jamais d'un administrateur). */
class UserController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        $filters = $request->validate([
            'q' => 'nullable|string|max:100',
            'role' => 'nullable|in:client,commercant,livreur',
            'account_type' => 'nullable|in:particulier,entreprise,conciergerie',
            'status' => 'nullable|in:active,inactive',
        ]);

        return User::query()
            ->where('role', '!=', 'admin')
            ->when($filters['role'] ?? null, fn ($q, $role) => $q->where('role', $role))
            ->when($filters['account_type'] ?? null, fn ($q, $type) => $q->where('account_type', $type))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                    ->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)->orWhere('company_name', 'like', $like));
            })
            ->latest()
            ->paginate(20)
            ->through(fn (User $u) => $u->only([
                'id', 'role', 'account_type', 'company_name', 'first_name', 'last_name', 'email', 'phone', 'is_active',
                'email_verified_at', 'last_login_at', 'created_at', 'avatar_url', 'company_id', 'custom_tariff',
            ]));
    }

    /**
     * Tarif négocié d'une entreprise (compte propriétaire) : remplace le barème standard pour toute son équipe.
     * Une valeur nulle ramène l'entreprise au barème standard.
     */
    public function setTariff(Request $request, User $user)
    {
        abort_unless($user->role === 'client' && $user->account_type === 'entreprise' && $user->company_id === null, 422, 'Un tarif négocié se fixe sur le compte propriétaire d\'une entreprise.');

        $validated = $request->validate([
            'base_fare' => 'required|integer|min:0|max:100000',
            'per_km' => 'required|integer|min:0|max:10000',
            'express_multiplier' => 'required|numeric|min:1|max:5',
        ]);

        $user->forceFill(['custom_tariff' => $validated])->save();
        $this->auditLog->log('admin.company_tariff.set', $user, $validated);

        return ['custom_tariff' => $validated];
    }

    public function clearTariff(User $user)
    {
        $user->forceFill(['custom_tariff' => null])->save();
        $this->auditLog->log('admin.company_tariff.cleared', $user);

        return response()->noContent();
    }

    public function update(Request $request, User $user)
    {
        $validated = $request->validate(['is_active' => 'required|boolean']);

        abort_if($user->role === 'admin', 403, 'Un compte administrateur ne se modifie pas ici.');

        $user->update($validated);

        // Un compte désactivé perd ses sessions ouvertes immédiatement.
        if (! $validated['is_active']) {
            $user->tokens()->delete();
        }

        $this->auditLog->log($validated['is_active'] ? 'admin.user.activated' : 'admin.user.deactivated', $user);

        return $user->only(['id', 'is_active']);
    }
}
