<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Ne concerne que le rôle "client" (l'expéditeur) : une entreprise
            // qui envoie des colis, ou un particulier. Cf. cahier des charges
            // "Parcours de l'expéditeur", étape 1.
            $table->enum('account_type', ['entreprise', 'particulier'])->nullable()->after('role');
            $table->string('company_name')->nullable()->after('last_name');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['account_type', 'company_name']);
        });
    }
};
