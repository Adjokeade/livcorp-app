<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use App\Notifications\ServiceProviderDecision;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Candidatures des prestataires de services : consultation, validation ou refus par l'administration. */
class ServiceProviderController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        $filters = $request->validate([
            'q' => 'nullable|string|max:100',
            'status' => 'nullable|in:pending,approved,rejected',
            'profession' => ['nullable', Rule::in(array_keys(ServiceProvider::PROFESSIONS))],
        ]);

        return ServiceProvider::query()
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['profession'] ?? null, fn ($q, $profession) => $q->where('profession', $profession))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                    ->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)->orWhere('city', 'like', $like));
            })
            ->latest('id')
            ->paginate(20);
    }

    public function approve(Request $request, ServiceProvider $serviceProvider)
    {
        $serviceProvider->update([
            'status' => 'approved',
            'rejection_reason' => null,
            'reviewed_at' => now(),
            'reviewed_by' => $request->user()->id,
        ]);

        $this->auditLog->log('service_provider.approved', $serviceProvider);
        $this->tell($serviceProvider);

        return $serviceProvider->fresh();
    }

    public function reject(Request $request, ServiceProvider $serviceProvider)
    {
        $validated = $request->validate(['reason' => 'required|string|max:500']);

        $serviceProvider->update([
            'status' => 'rejected',
            'rejection_reason' => $validated['reason'],
            'reviewed_at' => now(),
            'reviewed_by' => $request->user()->id,
        ]);

        $this->auditLog->log('service_provider.rejected', $serviceProvider, ['reason' => $validated['reason']]);
        $this->tell($serviceProvider);

        return $serviceProvider->fresh();
    }

    private function tell(ServiceProvider $provider): void
    {
        if ($provider->user) {
            rescue(fn () => $provider->user->notify(new ServiceProviderDecision($provider)));
        }
    }

    /** Modération : retire une offre inappropriée (ouverte ou déjà prise). */
    public function cancelRequest(ServiceRequest $serviceRequest)
    {
        abort_if($serviceRequest->status === 'cancelled', 422, 'Cette offre est déjà annulée.');

        $serviceRequest->update(['status' => 'cancelled']);
        $this->auditLog->log('service_request.cancelled_by_admin', $serviceRequest);

        return $serviceRequest->fresh(['client:id,first_name,last_name,phone,email', 'provider:id,first_name,last_name,phone,profession', 'conciergerie:id,first_name,last_name,phone,company_name']);
    }
}
