<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Équipe d'une entreprise : le compte créé à l'inscription est le propriétaire (company_id nul),
        // ses collaborateurs pointent vers lui. Responsable = voit tout et gère l'équipe ; opérateur = ses livraisons.
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('account_type')->constrained('users')->nullOnDelete();
            $table->enum('team_role', ['responsable', 'operateur'])->nullable()->after('company_id');
        });

        // Livreurs favoris : rattachés au propriétaire de l'entreprise (ou au particulier), donc partagés par l'équipe.
        Schema::create('favorite_deliverers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deliverer_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'deliverer_id']);
        });

        // Livraison proposée d'abord aux favoris : jusqu'à priority_until, seuls les favoris de priority_owner_id la voient.
        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('priority_until')->nullable();
            $table->unsignedBigInteger('priority_owner_id')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['priority_until', 'priority_owner_id']));
        Schema::dropIfExists('favorite_deliverers');
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
            $table->dropColumn('team_role');
        });
    }
};
