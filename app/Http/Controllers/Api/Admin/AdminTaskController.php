<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminTask;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/**
 * Gestion des tâches internes de l'équipe admin (comptes en attente, litiges ouverts,
 * paiements à effectuer...). Cf. cahier des charges §3.4 — "compte administrateur
 * pour la gestion, la validation et le suivi de l'ensemble des utilisateurs".
 */
class AdminTaskController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        $query = AdminTask::query()->with('assignedTo');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        if ($assignedToMe = $request->boolean('mine')) {
            $query->where('assigned_to', $request->user()->id);
        }

        return $query
            ->orderByRaw("FIELD(priority, 'urgente','haute','normale','basse')")
            ->latest()
            ->paginate(20);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:validation_livreur,validation_commercant,litige,paiement_a_effectuer,autre',
            'title' => 'required|string|max:150',
            'description' => 'nullable|string|max:1000',
            'priority' => 'nullable|in:basse,normale,haute,urgente',
            'assigned_to' => 'nullable|exists:users,id',
            'due_at' => 'nullable|date',
        ]);

        $task = AdminTask::create($validated + ['status' => 'a_faire']);
        $this->auditLog->log('admin_task.created', $task);

        return response()->json($task, 201);
    }

    public function assign(Request $request, AdminTask $adminTask)
    {
        $validated = $request->validate(['assigned_to' => 'required|exists:users,id']);
        $adminTask->update($validated);

        $this->auditLog->log('admin_task.assigned', $adminTask, $validated);

        return $adminTask->fresh('assignedTo');
    }

    public function updateStatus(Request $request, AdminTask $adminTask)
    {
        $validated = $request->validate(['status' => 'required|in:a_faire,en_cours,traite']);

        $adminTask->update([
            'status' => $validated['status'],
            'completed_at' => $validated['status'] === 'traite' ? now() : null,
        ]);

        $this->auditLog->log('admin_task.status_changed', $adminTask, $validated);

        return $adminTask->fresh();
    }
}
