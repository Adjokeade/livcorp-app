<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_tasks', function (Blueprint $table) {
            $table->id();
            $table->enum('type', [
                'validation_livreur', 'validation_commercant', 'litige', 'paiement_a_effectuer', 'autre',
            ])->index();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('taskable_type')->nullable();
            $table->unsignedBigInteger('taskable_id')->nullable();
            $table->enum('status', ['a_faire', 'en_cours', 'traite'])->default('a_faire')->index();
            $table->enum('priority', ['basse', 'normale', 'haute', 'urgente'])->default('normale');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['taskable_type', 'taskable_id'], 'admin_tasks_taskable_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_tasks');
    }
};
