<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('beneficiary_id')->constrained('users')->cascadeOnDelete();
            $table->enum('beneficiary_type', ['livreur', 'commercant']);
            $table->decimal('total_amount', 12, 2);
            $table->enum('period_type', ['journalier', 'hebdomadaire', 'mensuel']);
            $table->date('period_start');
            $table->date('period_end');
            $table->enum('status', ['pending', 'processing', 'paid', 'failed'])->default('pending')->index();
            $table->string('mobile_money_number')->nullable();
            $table->string('fedapay_payout_id')->nullable();
            $table->json('fedapay_payload')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payouts');
    }
};
