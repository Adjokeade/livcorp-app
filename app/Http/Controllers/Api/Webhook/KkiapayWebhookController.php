<?php

namespace App\Http\Controllers\Api\Webhook;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Services\KkiapayService;
use App\Services\OnlinePaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Notifications KKiaPay (succès ou échec d'un paiement). Route publique protégée par le secret hash du webhook
 * (en-tête x-kkiapay-secret). Le contenu de la notification n'est jamais cru : l'état réel est relu chez KKiaPay.
 * Répond toujours 2xx une fois la source authentifiée, sinon KKiaPay réessaie cinq fois.
 */
class KkiapayWebhookController extends Controller
{
    public function __construct(
        private readonly KkiapayService $kkiapay,
        private readonly OnlinePaymentService $payments,
    ) {}

    public function handle(Request $request)
    {
        if (! $this->kkiapay->webhookSecretMatches($request->header('x-kkiapay-secret'))) {
            Log::warning('Webhook KKiaPay rejeté : secret invalide.', ['ip' => $request->ip()]);

            return response()->json(['message' => 'Non autorisé.'], 401);
        }

        $providerId = (string) $request->input('transactionId', '');
        $reference = (string) $request->input('partnerId', '');

        $transaction = $reference !== '' ? Transaction::where('reference', $reference)->first() : null;
        $transaction ??= $providerId !== '' ? Transaction::where('provider_transaction_id', $providerId)->first() : null;

        if (! $transaction || $providerId === '') {
            Log::warning('Webhook KKiaPay : transaction inconnue.', ['reference' => $reference, 'transaction' => $providerId]);

            return response()->json(['message' => 'Transaction inconnue.']);
        }

        try {
            $this->payments->confirm($transaction, $providerId);
        } catch (Throwable $e) {
            Log::warning('Webhook KKiaPay : règlement non effectué.', ['transaction' => $transaction->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['message' => 'OK']);
    }
}
