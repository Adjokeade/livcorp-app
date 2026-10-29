<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Demandes de service d'un client : il publie une offre de prestation, un prestataire du bon métier la prend. */
class ServiceRequestController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        return ServiceRequest::where('client_id', $request->user()->id)
            ->with('provider:id,first_name,last_name,phone,profession')
            ->latest('id')
            ->paginate(20);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'profession' => ['required', Rule::in(array_keys(ServiceProvider::PROFESSIONS))],
            'title' => 'required|string|max:150',
            'description' => 'required|string|min:10|max:1500',
            'city' => 'required|string|max:100',
            'address' => 'nullable|string|max:255',
            'budget' => 'nullable|integer|min:0|max:100000000',
        ]);

        $serviceRequest = ServiceRequest::create($validated + ['client_id' => $request->user()->id]);

        $this->auditLog->log('service_request.created', $serviceRequest);

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
