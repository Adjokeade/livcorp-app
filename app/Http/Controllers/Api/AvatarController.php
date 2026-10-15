<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ParcelPhotoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Photo de profil. Obligatoire pour un livreur (le client doit pouvoir le reconnaître à la remise du colis),
 * facultative pour les autres. Servie par URL signée temporaire, comme les photos de colis.
 */
class AvatarController extends Controller
{
    public function __construct(private readonly ParcelPhotoService $photos) {}

    public function show(User $user)
    {
        $path = $user->getRawOriginal('avatar_path');
        abort_unless($path && Storage::disk('parcel_photos')->exists($path), 404);

        return Storage::disk('parcel_photos')->response($path, null, [
            'Cache-Control' => 'private, max-age=3600',
            'Content-Type' => 'image/jpeg',
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpg,jpeg,png,webp|max:8192',
        ], [
            'avatar.required' => 'Ajoutez votre photo de profil.',
            'avatar.image' => 'Le fichier doit être une photo.',
            'avatar.max' => 'Cette photo est trop lourde (8 Mo maximum).',
        ]);

        $user = $request->user();
        $previous = $user->getRawOriginal('avatar_path');
        $user->forceFill(['avatar_path' => $this->photos->storeAvatar($request->file('avatar'))])->save();
        $this->photos->delete($previous);

        return response()->json(['avatar_url' => $user->fresh()->avatar_url], 201);
    }

    public function destroy(Request $request)
    {
        $user = $request->user();

        abort_if($user->role === 'livreur', 422, 'La photo de profil est obligatoire pour un livreur : remplacez-la par une autre.');

        $this->photos->delete($user->getRawOriginal('avatar_path'));
        $user->forceFill(['avatar_path' => null])->save();

        return response()->noContent();
    }
}
