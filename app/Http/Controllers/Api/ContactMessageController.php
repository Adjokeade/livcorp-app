<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use App\Models\User;
use App\Notifications\ContactMessageReceived;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

/**
 * Formulaire "Contactez-nous" — public, pas besoin de compte.
 */
class ContactMessageController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:20',
            'subject' => 'required|string|max:150',
            'message' => 'required|string|max:2000',
        ]);

        $contactMessage = ContactMessage::create($validated);

        $this->auditLog->log('contact.message_received', $contactMessage);

        rescue(fn () => Notification::send(User::where('role', 'admin')->where('is_active', true)->get(), new ContactMessageReceived($contactMessage)));

        return response()->json([
            'message' => 'Votre message a bien été envoyé. Notre équipe vous répond au plus vite.',
        ], 201);
    }
}
