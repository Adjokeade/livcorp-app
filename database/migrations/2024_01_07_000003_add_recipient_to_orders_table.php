<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Personne qui réceptionne le colis, distincte du client qui commande.
            $table->string('recipient_name')->nullable()->after('dropoff_lng');
            $table->string('recipient_phone')->nullable()->after('recipient_name');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['recipient_name', 'recipient_phone']);
        });
    }
};
