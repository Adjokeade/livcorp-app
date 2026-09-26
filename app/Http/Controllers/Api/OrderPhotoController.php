<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Support\Facades\Storage;

/**
 * Sert la photo d'un colis. Route protégée par signature d'URL (middleware "signed") :
 * seuls ceux à qui l'API a remis l'URL (client, livreur concerné, admin) peuvent la lire,
 * et elle expire au bout de quelques heures. Un <img> ne pouvant pas envoyer de jeton
 * Bearer, la signature remplace l'authentification ici.
 */
class OrderPhotoController extends Controller
{
    public function delivery(Order $order)
    {
        abort_unless($order->delivery_photo_path && Storage::disk('parcel_photos')->exists($order->delivery_photo_path), 404);

        return Storage::disk('parcel_photos')->response($order->delivery_photo_path, null, [
            'Cache-Control' => 'private, max-age=3600',
            'Content-Type' => 'image/jpeg',
        ]);
    }

    public function show(Order $order)
    {
        abort_unless($order->photo_path && Storage::disk('parcel_photos')->exists($order->photo_path), 404);

        return Storage::disk('parcel_photos')->response($order->photo_path, null, [
            'Cache-Control' => 'private, max-age=3600',
            'Content-Type' => 'image/jpeg',
        ]);
    }
}
