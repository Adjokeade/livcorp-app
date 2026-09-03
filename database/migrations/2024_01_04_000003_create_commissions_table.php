<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('beneficiary_id')->constrained('users')->cascadeOnDelete(); // livreur ou commerçant
            $table->enum('beneficiary_type', ['livreur', 'commercant']);
            $table->decimal('rate', 5, 2); // taux appliqué (%)
            $table->decimal('order_amount', 10, 2);
            $table->decimal('commission_amount', 10, 2); // part LIV corp
            $table->decimal('net_amount', 10, 2); // part versée au bénéficiaire
            $table->enum('status', ['due', 'included_in_payout', 'paid'])->default('due')->index();
            $table->foreignId('payout_id')->nullable()->constrained('payouts')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commissions');
    }
};
