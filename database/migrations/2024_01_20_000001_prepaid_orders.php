<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Nouveau statut « remise » : le livreur a remis le colis et envoyé la photo de réception, l'expéditeur doit confirmer.
        Schema::table('orders', function (Blueprint $table) {
            $table->enum('status', [
                'creee', 'acceptee', 'colis_recupere', 'en_cours_livraison', 'remise', 'livree', 'annulee', 'litige',
            ])->default('creee')->change();
        });

        Schema::table('orders', function (Blueprint $table) {
            // Remise du colis (photo envoyée) : point de départ du délai de confirmation automatique.
            $table->timestamp('handed_over_at')->nullable();
            // Paiement qui couvre cette livraison (un seul paiement peut couvrir tout un envoi en lot).
            $table->foreignId('transaction_id')->nullable()->constrained('transactions')->nullOnDelete();
        });

        // Remboursement du client quand une livraison payée est annulée : fait par l'API, ou à faire à la main.
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('refund_status', 10)->nullable();   // done | manual
            $table->string('refund_note')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', fn (Blueprint $table) => $table->dropColumn(['refund_status', 'refund_note']));
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('transaction_id');
            $table->dropColumn('handed_over_at');
        });
    }
};
