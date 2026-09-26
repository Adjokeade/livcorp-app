<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Interactions client / livreur pendant la course : arrivées, code de remise, preuve photo, messagerie, désistement.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('initial_price', 10, 2)->nullable()->after('price');        // prix fixé par le client, avant toute contre-offre
            $table->timestamp('pickup_arrived_at')->nullable()->after('accepted_at');   // "Je suis arrivé" au retrait
            $table->timestamp('dropoff_arrived_at')->nullable()->after('picked_up_at'); // "Je suis arrivé" à la destination
            $table->text('delivery_code')->nullable();                                  // code de remise, chiffré
            $table->unsignedTinyInteger('delivery_code_attempts')->default(0);
            $table->timestamp('delivery_code_locked_until')->nullable();
            $table->string('delivery_photo_path')->nullable();                          // preuve photo à la remise
            $table->timestamp('failed_delivery_at')->nullable();                        // destinataire injoignable
        });

        DB::table('orders')->update(['initial_price' => DB::raw('price')]);

        Schema::create('order_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deliverer_id')->constrained()->cascadeOnDelete(); // livreur de la conversation : un nouveau livreur ne lit pas l'ancienne
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->string('body', 500);
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'deliverer_id', 'id']);
        });

        Schema::create('order_releases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deliverer_id')->constrained()->cascadeOnDelete();
            $table->string('reason', 40);
            $table->string('note', 300)->nullable();
            $table->timestamp('created_at')->useCurrent();

            // Un livreur qui s'est désisté d'une course ne peut plus la reprendre.
            $table->unique(['order_id', 'deliverer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_releases');
        Schema::dropIfExists('order_messages');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'initial_price', 'pickup_arrived_at', 'dropoff_arrived_at', 'delivery_code', 'delivery_code_attempts',
                'delivery_code_locked_until', 'delivery_photo_path', 'failed_delivery_at',
            ]);
        });
    }
};
