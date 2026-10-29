<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ServiceProvider;
use App\Models\User;
use App\Notifications\ServiceProviderApplied;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Inscription des prestataires de services (plombiers, coiffeuses, informaticiens…) : formulaire public qui
 * crée le compte (rôle "prestataire") et la candidature. Le prestataire peut se connecter tout de suite, mais
 * ne voit les offres de prestation qu'une fois son dossier validé par l'administration.
 */
class ServiceProviderController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    /** Liste des métiers proposés dans le formulaire. */
    public function professions()
    {
        return response()->json(collect(ServiceProvider::PROFESSIONS)->map(fn ($label, $value) => compact('value', 'label'))->values());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'sex' => 'nullable|in:homme,femme',
            'email' => 'required|email|max:255|unique:users,email',
            'phone' => 'required|string|min:8|max:20|unique:users,phone',
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
            'profession' => ['required', Rule::in(array_keys(ServiceProvider::PROFESSIONS))],
            'profession_other' => ['nullable', 'required_if:profession,autre', 'string', 'max:100'],
            'city' => 'required|string|max:100',
            'address' => 'nullable|string|max:255',
            'experience_years' => 'required|integer|min:0|max:60',
            'description' => 'required|string|min:20|max:1500',
        ]);

        if ($validated['profession'] !== 'autre') {
            $validated['profession_other'] = null;
        }

        $provider = DB::transaction(function () use ($validated) {
            $user = User::create([
                'role' => 'prestataire',
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'sex' => $validated['sex'] ?? null,
                'address' => $validated['city'],
                'email' => $validated['email'],
                'phone' => $validated['phone'],
                'password' => Hash::make($validated['password']),
            ]);

            if (! config('app.email_verification_required')) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }

            return ServiceProvider::create(collect($validated)->except(['password', 'password_confirmation'])->all() + ['user_id' => $user->id]);
        });

        $this->auditLog->log('service_provider.applied', $provider);

        rescue(fn () => Notification::send(User::where('role', 'admin')->where('is_active', true)->get(), new ServiceProviderApplied($provider)));

        return response()->json([
            'message' => 'Votre compte est créé. Connectez-vous : les offres s\'ouvrent dès que notre équipe a validé votre dossier.',
        ], 201);
    }
}
