<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Colonnes neutres vis-à-vis du prestataire de paiement (FedaPay hier, KKiaPay aujourd'hui).
        Schema::table('transactions', function (Blueprint $table) {
            $table->renameColumn('fedapay_transaction_id', 'provider_transaction_id');
            $table->renameColumn('fedapay_payload', 'provider_payload');
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->string('provider', 20)->default('kkiapay')->after('user_id');
            // Référence LIV corp envoyée au prestataire (partnerId) : sert à retrouver la transaction au retour et au webhook.
            $table->string('reference', 40)->nullable()->unique()->after('provider');
        });

        // Les transactions déjà enregistrées viennent de FedaPay.
        DB::table('transactions')->update(['provider' => 'fedapay']);

        // KKiaPay n'a pas d'API de versement vers des tiers : les versements aux livreurs sont préparés par LIV corp
        // puis payés en Mobile Money par l'administration, qui les marque comme versés.
        Schema::table('payouts', function (Blueprint $table) {
            $table->renameColumn('fedapay_payout_id', 'reference');
            $table->renameColumn('fedapay_payload', 'provider_payload');
        });

        Schema::table('payouts', function (Blueprint $table) {
            $table->foreignId('paid_by')->nullable()->after('paid_at')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('paid_by');
        });
        Schema::table('payouts', function (Blueprint $table) {
            $table->renameColumn('reference', 'fedapay_payout_id');
            $table->renameColumn('provider_payload', 'fedapay_payload');
        });
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropUnique(['reference']);
            $table->dropColumn(['provider', 'reference']);
        });
        Schema::table('transactions', function (Blueprint $table) {
            $table->renameColumn('provider_transaction_id', 'fedapay_transaction_id');
            $table->renameColumn('provider_payload', 'fedapay_payload');
        });
    }
};
