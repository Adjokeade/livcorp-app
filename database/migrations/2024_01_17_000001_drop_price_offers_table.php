<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Le prix est imposé par LIV corp : les contre-propositions des livreurs n'existent plus.
        Schema::dropIfExists('price_offers');
    }

    public function down(): void
    {
        Schema::create('price_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deliverer_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('message', 300)->nullable();
            $table->enum('status', ['pending', 'accepted', 'declined', 'withdrawn'])->default('pending');
            $table->timestamps();
            $table->unique(['order_id', 'deliverer_id']);
        });
    }
};
