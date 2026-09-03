<?php

namespace App\Http\Controllers\Api\Webhook;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Services\AuditLogService;
use App\Services\FedaPayService;
use App\Services\OrderStatusService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Réception des webhooks FedaPay (confirmation asynchrone des paiements).
 * Route PUBLIQUE (pas d'auth Sanctum) mais protégée par vérification de signature —
 * cf. exigence sécurité : "vérification de signature des webhooks FedaPay avant tout traitement".
 */
class FedaPayWebhookController extends Controller
{
    public function __construct(
        private readonly FedaPayService $fedapay,
        private readonly AuditLogService $auditLog,
    ) {}

    public function handle(Request $request)
    {
        $signature = $request->header('X-FEDAPAY-SIGNATURE', '');

        if (! $this->fedapay->verifyWebhookSignature($request->getContent(), $signature)) {
            Log::warning('Webhook FedaPay rejeté : signature invalide.', ['ip' => $request->ip()]);
            return response()->json(['message' => 'Signature invalide.'], 401);
        }

        $payload = $request->json()->all();
        $fedapayTransactionId = $payload['data']['id'] ?? null;
        $status = $payload['name'] ?? null; // ex: "transaction.approved", "transaction.declined"

        $transaction = Transaction::where('fedapay_transaction_id', $fedapayTransactionId)->first();

        if (! $transaction) {
            Log::warning('Webhook FedaPay : transaction inconnue.', ['fedapay_id' => $fedapayTransactionId]);
            return response()->json(['message' => 'Transaction inconnue.'], 404);
        }

        $newStatus = match ($status) {
            'transaction.approved' => 'approved',
            'transaction.declined', 'transaction.canceled' => 'failed',
            default => $transaction->status,
        };

        $transaction->update([
            'status' => $newStatus,
            'fedapay_payload' => $payload,
            'paid_at' => $newStatus === 'approved' ? now() : null,
        ]);

        $transaction->order->update([
            'payment_status' => $newStatus === 'approved' ? 'paye' : ($newStatus === 'failed' ? 'echoue' : 'en_attente'),
        ]);

        $this->auditLog->log('payment.webhook_received', $transaction, ['status' => $newStatus]);

        return response()->json(['message' => 'OK']);
    }
}
