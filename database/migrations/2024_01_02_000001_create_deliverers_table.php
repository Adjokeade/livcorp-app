<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deliverers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->enum('verification_status', ['pending', 'approved', 'rejected'])->default('pending')->index();
            $table->string('rejection_reason')->nullable();
            $table->enum('vehicle_type', ['moto', 'velo', 'voiture', 'a_pied'])->default('moto');
            $table->string('vehicle_plate')->nullable();
            $table->boolean('is_available')->default(false)->index();
            $table->decimal('current_lat', 10, 7)->nullable();
            $table->decimal('current_lng', 10, 7)->nullable();
            $table->timestamp('location_updated_at')->nullable();
            $table->decimal('average_rating', 3, 2)->default(0);
            $table->unsignedInteger('total_deliveries')->default(0);
            $table->decimal('wallet_balance', 12, 2)->default(0);
            $table->string('mobile_money_number')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliverers');
    }
};
