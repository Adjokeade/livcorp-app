<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('instructions');           // photo du colis (disque privé)
            $table->string('pickup_details')->nullable()->after('pickup_lng');          // repère : "en face de la pharmacie…"
            $table->string('dropoff_details')->nullable()->after('dropoff_lng');
            $table->decimal('price_suggested', 10, 2)->nullable()->after('price');      // prix conseillé au moment de la commande
            $table->unsignedSmallInteger('duration_min')->nullable()->after('distance_km');
        });

        // Négociation de prix : un livreur propose un autre montant, le client l'accepte ou non.
        Schema::create('price_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deliverer_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('message', 300)->nullable();
            $table->enum('status', ['pending', 'accepted', 'declined', 'withdrawn'])->default('pending')->index();
            $table->timestamps();

            // Une seule offre par livreur et par commande : il la modifie plutôt que de la multiplier.
            $table->unique(['order_id', 'deliverer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_offers');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['photo_path', 'pickup_details', 'dropoff_details', 'price_suggested', 'duration_min']);
        });
    }
};
