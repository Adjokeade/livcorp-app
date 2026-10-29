<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceProvider;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Demandes de service des clients, vues par l'administration (supervision) : le prestataire reste
 * libre de prendre lui-même une offre ouverte (voir Api\Provider\OfferController) — cette vue ne
 * remplace pas ce circuit, elle permet juste à l'administration de suivre les demandes et, au besoin,
 * de contacter elle-même un prestataire correspondant (ex. une demande ouverte depuis longtemps).
 */
class ServiceRequestController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'q' => 'nullable|string|max:100',
            'status' => 'nullable|in:open,taken,cancelled',
            'profession' => ['nullable', Rule::in([...array_keys(ServiceProvider::PROFESSIONS), 'conciergerie'])],
            'city' => 'nullable|string|max:100',
        ]);

        return ServiceRequest::query()
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['profession'] ?? null, fn ($q, $profession) => $q->where('profession', $profession))
            ->when($filters['city'] ?? null, fn ($q, $city) => $q->where('city', 'like', '%'.$city.'%'))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('description', 'like', $like));
            })
            ->with(['client:id,first_name,last_name,phone', 'provider:id,first_name,last_name,phone,profession', 'conciergerie:id,first_name,last_name,phone,company_name'])
            ->latest('id')
            ->paginate(20);
    }

    /**
     * Prestataires approuvés du même métier que cette demande — ceux du même ville en premier — avec
     * leurs coordonnées, pour que l'administration puisse les contacter directement au sujet de cette
     * demande précise.
     */
    public function matchingProviders(ServiceRequest $serviceRequest)
    {
        return ServiceProvider::query()
            ->where('status', 'approved')
            ->where('profession', $serviceRequest->profession)
            ->orderByRaw('city = ? desc', [$serviceRequest->city])
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'phone', 'email', 'city', 'experience_years']);
    }
}
