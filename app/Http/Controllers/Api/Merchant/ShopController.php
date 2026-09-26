<?php

namespace App\Http\Controllers\Api\Merchant;

use App\Http\Controllers\Controller;
use App\Http\Requests\Merchant\UpdateShopRequest;
use Illuminate\Http\Request;

/**
 * Gestion du profil boutique du commerçant.
 * Routes protégées par : auth:sanctum, role:commercant, verified.email
 */
class ShopController extends Controller
{
    public function show(Request $request)
    {
        $merchant = $request->user()->merchant;

        abort_if(! $merchant, 404, 'Profil boutique introuvable.');

        return $merchant;
    }

    public function update(UpdateShopRequest $request)
    {
        // shop_name/shop_address sont NOT NULL : il faut les fournir dès la
        // création, pas seulement dans un update() séparé qui suivrait.
        $merchant = $request->user()->merchant()->firstOrCreate([], $request->validated());
        $merchant->update($request->validated());

        // Toute modification substantielle repasse la boutique en attente de validation
        if ($merchant->wasChanged(['shop_name', 'shop_address'])) {
            $merchant->update(['verification_status' => 'pending']);
        }

        return $merchant->fresh();
    }
}
