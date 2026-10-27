<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_providers', function (Blueprint $table) {
            $table->id();
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->enum('sex', ['homme', 'femme'])->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 20)->index();
            $table->string('profession', 40)->index();
            $table->string('profession_other', 100)->nullable();
            $table->string('city', 100);
            $table->string('address')->nullable();
            $table->unsignedTinyInteger('experience_years')->default(0);
            $table->text('description');
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending')->index();
            $table->string('rejection_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_providers');
    }
};
