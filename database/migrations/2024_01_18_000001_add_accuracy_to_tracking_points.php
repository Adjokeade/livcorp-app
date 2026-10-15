<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Précision annoncée par le GPS du téléphone, en mètres : permet de repérer les positions peu fiables.
        Schema::table('tracking_points', function (Blueprint $table) {
            $table->unsignedSmallInteger('accuracy_m')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('tracking_points', fn (Blueprint $table) => $table->dropColumn('accuracy_m'));
    }
};
