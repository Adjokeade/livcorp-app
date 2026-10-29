<?php

namespace App\Http\Controllers\Api\Conciergerie;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Notifications\ServiceRequestTaken;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/** Missions de conciergerie (courses, démarches, achats) publiées par les clients, vues par une conciergerie validée. */
class MissionController extends Controller
{
    public const PROFESSION = 'conciergerie';

    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        $filters = $request->validate(['q' => 'nullable|string|max:100', 'city' => 'nullable|string|max:100']);

        return ServiceRequest::query()
            ->where('status', 'open')
            ->where('profession', self::PROFESSION)
            ->where('client_id', '!=', $request->user()->id)
            ->when($filters['city'] ?? null, fn ($q, $city) => $q->where('city', 'like', '%'.$city.'%'))
            ->when($filters['q'] ?? null, fn ($q, $term) => $q->where(fn ($w) => $w->where('title', 'like', '%'.$term.'%')->orWhere('description', 'like', '%'.$term.'%')))
            ->with('client:id,first_name')
            ->latest('id')
            ->paginate(20)
            ->through(fn (ServiceRequest $r) => $r->present(false));
    }

    public function mine(Request $request)
    {
        return ServiceRequest::where('conciergerie_id', $request->user()->id)
            ->with('client:id,first_name,last_name,phone')
            ->latest('taken_at')
            ->paginate(20)
            ->through(fn (ServiceRequest $r) => $r->present(true));
    }

    public function accept(Request $request, ServiceRequest $serviceRequest)
    {
        $user = $request->user();
        abort_unless($serviceRequest->profession === self::PROFESSION, 403, 'Cette offre n\'est pas une mission de conciergerie.');
        abort_if($serviceRequest->client_id === $user->id, 403, 'Vous ne pouvez pas prendre votre propre mission.');

        // Mise à jour conditionnelle : si deux conciergeries cliquent en même temps, une seule l'emporte.
        $taken = ServiceRequest::where('id', $serviceRequest->id)->where('status', 'open')
            ->update(['status' => 'taken', 'conciergerie_id' => $user->id, 'taken_at' => now()]);
        abort_unless($taken, 409, 'Cette mission n\'est plus disponible.');

        rescue(fn () => $serviceRequest->client->notify(new ServiceRequestTaken($serviceRequest)));
        $this->auditLog->log('service_request.taken_by_conciergerie', $serviceRequest, ['conciergerie_id' => $user->id]);

        return $serviceRequest->fresh('client:id,first_name,last_name,phone')->present(true);
    }
}
