<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class DisputeController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        return Dispute::with(['order', 'raisedBy', 'assignedTo'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->latest()
            ->paginate(15);
    }

    public function assign(Request $request, Dispute $dispute)
    {
        $validated = $request->validate(['assigned_to' => 'required|exists:users,id']);
        $dispute->update(['assigned_to' => $validated['assigned_to'], 'status' => 'en_cours']);

        $this->auditLog->log('dispute.assigned', $dispute, $validated);

        return $dispute->fresh(['assignedTo']);
    }

    public function resolve(Request $request, Dispute $dispute)
    {
        $validated = $request->validate([
            'resolution' => 'required|in:remboursement_total,remboursement_partiel,sans_suite,autre',
            'resolution_note' => 'nullable|string|max:1000',
        ]);

        $dispute->update([
            ...$validated,
            'status' => 'resolu',
            'resolved_at' => now(),
        ]);

        $this->auditLog->log('dispute.resolved', $dispute, $validated);

        // TODO: si remboursement, déclencher le remboursement FedaPay correspondant

        return $dispute->fresh();
    }
}
