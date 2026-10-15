<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Demande annulée « retirée » de la liste de l'expéditeur : masquée pour lui, conservée pour l'historique de la plateforme.
        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('client_hidden_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('client_hidden_at'));
    }
};
