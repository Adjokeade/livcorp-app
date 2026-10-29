<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Les conciergeries sont validées par l'administration (comme les prestataires) avant d'accéder aux
     * missions de conciergerie publiées par les clients et qu'elles prennent en charge.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('conciergerie_status', 20)->nullable()->after('account_type');
            $table->string('conciergerie_rejection_reason')->nullable()->after('conciergerie_status');
        });

        // Les conciergeries déjà inscrites avant la validation restent actives.
        DB::table('users')->where('account_type', 'conciergerie')->update(['conciergerie_status' => 'approved']);

        Schema::table('service_requests', function (Blueprint $table) {
            $table->foreignId('conciergerie_id')->nullable()->after('provider_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('conciergerie_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['conciergerie_status', 'conciergerie_rejection_reason']);
        });
    }
};
