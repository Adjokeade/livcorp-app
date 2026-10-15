<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SavedAddress;
use Illuminate\Http\Request;

/** Adresses enregistrées de l'utilisateur (domicile, bureau, entrepôt…), toujours localisées. */
class SavedAddressController extends Controller
{
    private const MAX_PER_USER = 20;

    public function index(Request $request)
    {
        return $request->user()->savedAddresses()->orderBy('label')->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'label' => 'required|string|max:60',
            'address' => 'required|string|max:255',
            'lat' => 'required|numeric|between:6.2,12.45',
            'lng' => 'required|numeric|between:0.7,3.9',
        ], [
            'lat.between' => 'Cette adresse est en dehors du Bénin.',
            'lng.between' => 'Cette adresse est en dehors du Bénin.',
        ]);

        abort_if(
            $request->user()->savedAddresses()->count() >= self::MAX_PER_USER,
            422,
            'Vous avez atteint la limite de '.self::MAX_PER_USER.' adresses enregistrées.'
        );

        return response()->json($request->user()->savedAddresses()->create($validated), 201);
    }

    public function destroy(Request $request, SavedAddress $address)
    {
        abort_unless($address->user_id === $request->user()->id, 404);
        $address->delete();

        return response()->noContent();
    }
}
