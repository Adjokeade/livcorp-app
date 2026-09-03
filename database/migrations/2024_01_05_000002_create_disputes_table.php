<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('disputes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('raised_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete(); // admin en charge
            $table->enum('reason', ['colis_endommage', 'colis_non_livre', 'retard', 'comportement_livreur', 'paiement', 'autre']);
            $table->text('description');
            $table->enum('status', ['ouvert', 'en_cours', 'resolu', 'rejete'])->default('ouvert')->index();
            $table->enum('resolution', ['remboursement_total', 'remboursement_partiel', 'sans_suite', 'autre'])->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('disputes');
    }
};
