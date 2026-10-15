<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tarif négocié avec une entreprise (base, prix au km, majoration express), saisi par l'administration.
        // Porté par le compte propriétaire : toute son équipe en bénéficie. Nul = barème standard.
        Schema::table('users', function (Blueprint $table) {
            $table->json('custom_tariff')->nullable();
        });

        // Le prix est désormais imposé par LIV corp selon la distance : plus de contre-proposition des livreurs.
        // Celles qui attendaient une réponse sont closes (le client ne les verrait plus de toute façon).
        DB::table('price_offers')->where('status', 'pending')->update(['status' => 'declined']);
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('custom_tariff'));
    }
};
