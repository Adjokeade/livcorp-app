<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Deliverer;
use App\Notifications\DelivererAccountApproved;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/**
 * Validation des comptes livreurs par l'administrateur.
 * Cf. cahier des charges §3.4 : "Gestion et validation des comptes (livreurs)".
 */
class DelivererValidationController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function pending(Request $request)
    {
        return Deliverer::where('verification_status', 'pending')
            ->with(['user', 'user.documents'])
            ->latest()
            ->paginate(15);
    }

    public function approve(Request $request, Deliverer $deliverer)
    {
        $deliverer->update([
            'verification_status' => 'approved',
            'verified_at' => now(),
            'verified_by' => $request->user()->id,
        ]);

        $this->auditLog->log('deliverer.approved', $deliverer);

        $deliverer->user->notify(new DelivererAccountApproved($deliverer));

        return $deliverer->fresh('user');
    }

    public function reject(Request $request, Deliverer $deliverer)
    {
        $validated = $request->validate(['reason' => 'required|string|max:500']);

        $deliverer->update([
            'verification_status' => 'rejected',
            'rejection_reason' => $validated['reason'],
        ]);

        $this->auditLog->log('deliverer.rejected', $deliverer, ['reason' => $validated['reason']]);

        return $deliverer->fresh('user');
    }
}
