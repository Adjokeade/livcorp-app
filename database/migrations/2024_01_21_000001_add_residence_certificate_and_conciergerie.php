<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Deux listes fermées s'élargissent : les types de pièces (certificat de résidence du livreur) et
     * les catégories de compte (conciergerie). Les validations restent côté application, la colonne
     * devient un simple texte pour ne plus dépendre d'un ENUM propre à MySQL.
     */
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->string('type', 40)->change();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('account_type', 30)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Retour à l'ENUM impossible sans perdre les nouvelles valeurs : on conserve le texte.
    }
};
