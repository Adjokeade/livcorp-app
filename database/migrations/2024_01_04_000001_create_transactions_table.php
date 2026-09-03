<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); // client payeur
            $table->string('fedapay_transaction_id')->unique()->nullable();
            $table->enum('method', ['mobile_money', 'carte'])->nullable();
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3)->default('XOF');
            $table->enum('status', ['pending', 'approved', 'failed', 'cancelled', 'refunded'])->default('pending')->index();
            $table->json('fedapay_payload')->nullable(); // réponse brute FedaPay (traçabilité)
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
