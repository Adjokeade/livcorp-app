<?php

namespace App\Http\Controllers\Api\Deliverer;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\User;
use App\Notifications\DelivererDocumentsReceived;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;

/**
 * Dépôt des pièces justificatives du livreur (cf. cahier des charges
 * "Parcours du livreur", étape 1). Volontairement hors des middlewares
 * verified.email et deliverer.verified : c'est justement ce dépôt qui
 * permet à l'administrateur de valider le compte.
 */
class DocumentController extends Controller
{
    private const TYPES = [
        'id_card' => 'piece_identite',
        'driving_license' => 'permis_conduire',
    ];

    public function store(Request $request)
    {
        $validated = $request->validate([
            'id_card' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:5120',
            'driving_license' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:5120',
            'vehicle_type' => 'nullable|in:moto,velo,voiture,a_pied',
            'vehicle_plate' => 'nullable|string|max:20',
        ]);

        $user = $request->user();

        if (! $request->hasFile('id_card') && ! $request->hasFile('driving_license')) {
            return response()->json([
                'message' => 'Ajoutez au moins un document.',
                'errors' => ['id_card' => ['Ajoutez au moins un document.']],
            ], 422);
        }

        DB::transaction(function () use ($request, $user, $validated) {
            foreach (self::TYPES as $field => $type) {
                if (! $request->hasFile($field)) {
                    continue;
                }

                // Un nouvel envoi remplace le précédent du même type tant qu'il n'est pas validé.
                $user->documents()->where('type', $type)->where('status', '!=', 'approved')->get()
                    ->each(function (Document $old) {
                        Storage::disk('documents_private')->delete($old->path);
                        $old->delete();
                    });

                $path = $request->file($field)->store('user-'.$user->id, 'documents_private');

                $user->documents()->create(['type' => $type, 'path' => $path, 'status' => 'pending']);
            }

            $user->deliverer?->update(array_filter([
                'vehicle_type' => $validated['vehicle_type'] ?? null,
                'vehicle_plate' => $validated['vehicle_plate'] ?? null,
            ]));

            // Un livreur refusé qui renvoie ses pièces repasse dans la file de validation ;
            // sans cela, l'administrateur ne verrait jamais le nouveau dossier.
            if ($user->deliverer?->verification_status === 'rejected') {
                $user->deliverer->update(['verification_status' => 'pending', 'rejection_reason' => null]);
            }
        });

        rescue(fn () => Notification::send(User::where('role', 'admin')->where('is_active', true)->get(), new DelivererDocumentsReceived($user)));

        return response()->json([
            'message' => 'Documents reçus. Notre équipe les examine sous 24 à 48 h.',
            'documents' => $user->documents()->get(['id', 'type', 'status']),
        ], 201);
    }
}
