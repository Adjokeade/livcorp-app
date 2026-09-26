<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/**
 * Lecture des messages reçus via le formulaire public "Contactez-nous".
 */
class ContactMessageController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        $validated = $request->validate(['status' => 'nullable|in:nouveau,traite']);

        $messages = ContactMessage::query()
            ->when($validated['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->latest()
            ->paginate(15);

        // Le compteur de non lus alimente le badge de l'onglet, quel que soit le filtre affiché.
        return response()->json([
            ...$messages->toArray(),
            'new_count' => ContactMessage::where('status', 'nouveau')->count(),
        ]);
    }

    public function updateStatus(Request $request, ContactMessage $contactMessage)
    {
        $validated = $request->validate(['status' => 'required|in:nouveau,traite']);

        $contactMessage->update($validated);

        $this->auditLog->log('contact.message_'.$validated['status'], $contactMessage);

        return $contactMessage->fresh();
    }
}
