<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Recipient;
use Illuminate\Http\Request;

class RecipientController extends Controller
{
    private const MAX_PER_USER = 200;

    public function index(Request $request)
    {
        return $request->user()->ownerAccount()->recipients()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'phone' => 'required|string|max:20',
            'address' => 'required|string|max:255',
            'lat' => 'required|numeric|between:6.2,12.45',
            'lng' => 'required|numeric|between:0.7,3.9',
            'details' => 'nullable|string|max:255',
        ], [
            'lat.between' => 'Cette adresse est en dehors du Bénin.',
            'lng.between' => 'Cette adresse est en dehors du Bénin.',
        ]);

        abort_if(
            $request->user()->ownerAccount()->recipients()->count() >= self::MAX_PER_USER,
            422,
            'Votre carnet est plein ('.self::MAX_PER_USER.' destinataires maximum).'
        );

        return response()->json($request->user()->ownerAccount()->recipients()->create($validated), 201);
    }

    public function destroy(Request $request, Recipient $recipient)
    {
        // Le carnet est partagé par l'équipe : il appartient au propriétaire de l'entreprise.
        abort_unless($recipient->user_id === $request->user()->ownerAccount()->id, 404);
        $recipient->delete();

        return response()->noContent();
    }
}
