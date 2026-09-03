<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique(); // identifiant unique visible (ex: LIV-2026-000123)
            $table->enum('type', ['colis', 'course']);
            $table->foreignId('client_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('merchant_id')->nullable()->constrained('merchants')->nullOnDelete();
            $table->foreignId('deliverer_id')->nullable()->constrained('deliverers')->nullOnDelete();

            // Adresses
            $table->text('pickup_address');
            $table->decimal('pickup_lat', 10, 7);
            $table->decimal('pickup_lng', 10, 7);
            $table->text('dropoff_address');
            $table->decimal('dropoff_lat', 10, 7);
            $table->decimal('dropoff_lng', 10, 7);

            // Détails colis / course
            $table->string('package_type')->nullable();
            $table->text('instructions')->nullable();
            $table->enum('urgency', ['standard', 'express'])->default('standard');
            $table->decimal('distance_km', 8, 2)->nullable();

            // Tarification
            $table->decimal('price', 10, 2);
            $table->decimal('commission_amount', 10, 2)->default(0);
            $table->decimal('deliverer_payout', 10, 2)->default(0);

            // Statut courant (dénormalisé pour requêtes rapides ; historique complet dans order_status_history)
            $table->enum('status', [
                'creee', 'acceptee', 'colis_recupere', 'en_cours_livraison', 'livree', 'annulee', 'litige',
            ])->default('creee')->index();

            $table->enum('payment_status', ['en_attente', 'paye', 'echoue', 'rembourse'])->default('en_attente')->index();

            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('picked_up_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
