<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverers', function (Blueprint $table) {
            // Contact à prévenir en cas d'urgence pendant une course.
            $table->string('emergency_phone')->nullable()->after('vehicle_plate');
        });
    }

    public function down(): void
    {
        Schema::table('deliverers', function (Blueprint $table) {
            $table->dropColumn('emergency_phone');
        });
    }
};
