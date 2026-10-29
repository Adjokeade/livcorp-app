<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Notifications\ServiceRequestTaken;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/** Offres de prestation vues par un prestataire validé : celles de son métier, et celles qu'il a prises. */
class OfferController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    /** Offres ouvertes de son métier (les coordonnées du client ne sont données qu'une fois l'offre prise). */
    public function index(Request $request)
    {
        $filters = $request->validate(['q' => 'nullable|string|max:100', 'city' => 'nullable|string|max:100']);

        return ServiceRequest::query()
            ->where('status', 'open')
            ->where('profession', $request->user()->serviceProvider->profession)
            ->when($filters['city'] ?? null, fn ($q, $city) => $q->where('city', 'like', '%'.$city.'%'))
            ->when($filters['q'] ?? null, fn ($q, $term) => $q->where(fn ($w) => $w->where('title', 'like', '%'.$term.'%')->orWhere('description', 'like', '%'.$term.'%')))
            ->with('client:id,first_name')
            ->latest('id')
            ->paginate(20)
            ->through(fn (ServiceRequest $r) => $r->present(false));
    }

    public function mine(Request $request)
    {
        return ServiceRequest::where('provider_id', $request->user()->serviceProvider->id)
            ->with('client:id,first_name,last_name,phone')
            ->latest('taken_at')
            ->paginate(20)
            ->through(fn (ServiceRequest $r) => $r->present(true));
    }

    public function accept(Request $request, ServiceRequest $serviceRequest)
    {
        $provider = $request->user()->serviceProvider;
        abort_unless($serviceRequest->profession === $provider->profession, 403, 'Cette offre ne correspond pas à votre métier.');

        // Mise à jour conditionnelle : si deux prestataires cliquent en même temps, un seul l'emporte.
        $taken = ServiceRequest::where('id', $serviceRequest->id)->where('status', 'open')
            ->update(['status' => 'taken', 'provider_id' => $provider->id, 'taken_at' => now()]);
        abort_unless($taken, 409, 'Cette offre n\'est plus disponible.');

        rescue(fn () => $serviceRequest->client->notify(new ServiceRequestTaken($serviceRequest)));
        $this->auditLog->log('service_request.taken', $serviceRequest, ['provider_id' => $provider->id]);

        return $serviceRequest->fresh('client:id,first_name,last_name,phone')->present(true);
    }
}
