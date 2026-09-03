<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('merchants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('shop_name');
            $table->text('shop_address');
            $table->decimal('shop_lat', 10, 7)->nullable();
            $table->decimal('shop_lng', 10, 7)->nullable();
            $table->string('shop_phone')->nullable();
            $table->json('opening_hours')->nullable();
            $table->enum('verification_status', ['pending', 'approved', 'rejected'])->default('pending')->index();
            $table->string('rejection_reason')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('merchants');
    }
};
