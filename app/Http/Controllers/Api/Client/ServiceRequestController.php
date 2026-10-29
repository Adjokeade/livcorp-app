<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use App\Notifications\NewServiceRequest;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

/** Demandes de service d'un client : il publie une offre de prestation, un prestataire du bon métier la prend. */
class ServiceRequestController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        return ServiceRequest::where('client_id', $request->user()->id)
            ->with(['provider:id,first_name,last_name,phone,profession', 'conciergerie:id,first_name,last_name,phone,company_name'])
            ->latest('id')
            ->paginate(20);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'profession' => ['required', Rule::in([...array_keys(ServiceProvider::PROFESSIONS), 'conciergerie'])],
            'title' => 'required|string|max:150',
            'description' => 'required|string|min:10|max:1500',
            'city' => 'required|string|max:100',
            'address' => 'nullable|string|max:255',
            'budget' => 'nullable|integer|min:0|max:100000000',
        ]);

        $serviceRequest = ServiceRequest::create($validated + ['client_id' => $request->user()->id]);

        $this->auditLog->log('service_request.created', $serviceRequest);

        // Les prestataires validés du métier sont prévenus ; un échec d'envoi ne doit jamais faire échouer la publication.
        $providers = $serviceRequest->profession === 'conciergerie'
            ? \App\Models\User::where('role', 'client')->where('account_type', 'conciergerie')->where('conciergerie_status', 'approved')
                ->where('is_active', true)->where('id', '!=', $serviceRequest->client_id)->get()
            : \App\Models\User::whereHas('serviceProvider', fn ($q) => $q->where('status', 'approved')->where('profession', $serviceRequest->profession))
                ->where('is_active', true)->get();
        rescue(fn () => Notification::send($providers, new NewServiceRequest($serviceRequest)));

        return response()->json($serviceRequest, 201);
    }

    public function cancel(Request $request, ServiceRequest $serviceRequest)
    {
        abort_unless($serviceRequest->client_id === $request->user()->id, 404);
        abort_unless($serviceRequest->status === 'open', 422, 'Seule une offre encore ouverte peut être annulée.');

        $serviceRequest->update(['status' => 'cancelled']);

        return $serviceRequest->fresh();
    }
}
