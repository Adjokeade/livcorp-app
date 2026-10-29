<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Les prestataires deviennent des comptes (rôle "prestataire") qui se connectent pour consulter les
     * offres de prestation, publiées par les clients sous forme de demandes de service.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 20)->change();
        });

        Schema::table('service_providers', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->unique()->after('id')->constrained()->nullOnDelete();
        });

        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('provider_id')->nullable()->constrained('service_providers')->nullOnDelete();
            $table->string('profession', 40)->index();
            $table->string('title', 150);
            $table->text('description');
            $table->string('city', 100);
            $table->string('address')->nullable();
            $table->unsignedInteger('budget')->nullable();
            $table->enum('status', ['open', 'taken', 'cancelled'])->default('open')->index();
            $table->timestamp('taken_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_requests');
        Schema::table('service_providers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
