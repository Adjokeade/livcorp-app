<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ServiceProvider;
use App\Models\User;
use App\Notifications\ServiceProviderApplied;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Inscription des prestataires de services (plombiers, coiffeuses, informaticiens…) : formulaire public,
 * sans compte. La candidature attend la décision de l'administration.
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
            'email' => 'nullable|email|max:255',
            'phone' => 'required|string|min:8|max:20',
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

        // Un même numéro ne dépose pas deux candidatures actives : on évite les doublons dans la file de l'administration.
        $duplicate = ServiceProvider::where('phone', $validated['phone'])->whereIn('status', ['pending', 'approved'])->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['phone' => 'Une candidature existe déjà avec ce numéro de téléphone.']);
        }

        $provider = ServiceProvider::create($validated);

        $this->auditLog->log('service_provider.applied', $provider);

        rescue(fn () => Notification::send(User::where('role', 'admin')->where('is_active', true)->get(), new ServiceProviderApplied($provider)));

        return response()->json([
            'message' => 'Votre candidature est bien reçue. Notre équipe l\'examine et vous recontacte au plus vite.',
        ], 201);
    }
}
