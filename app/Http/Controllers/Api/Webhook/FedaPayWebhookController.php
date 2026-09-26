<?php

namespace App\Http\Controllers\Api\Webhook;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Notifications\PaymentValidatedForDeliverer;
use App\Services\AuditLogService;
use App\Services\FedaPayService;
use FedaPay\Event;
use FedaPay\FedaPayObject;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

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
        try {
            $event = $this->fedapay->constructWebhookEvent(
                $request->getContent(),
                $request->header('X-FEDAPAY-SIGNATURE', ''),
            );
        } catch (Throwable $e) {
            Log::warning('Webhook FedaPay rejeté : signature invalide.', [
                'ip' => $request->ip(),
                'error' => $e->getMessage(),
            ]);

            return response()->json(['message' => 'Signature invalide.'], 401);
        }

        $eventType = $event->type ?? $event->name ?? null; // ex: "transaction.approved"
        $fedapayTransactionId = $this->extractTransactionId($event);

        $transaction = Transaction::where('fedapay_transaction_id', $fedapayTransactionId)->first();

        if (! $transaction) {
            Log::warning('Webhook FedaPay : transaction inconnue.', [
                'fedapay_id' => $fedapayTransactionId,
                'event_type' => $eventType,
            ]);

            return response()->json(['message' => 'Transaction inconnue.'], 404);
        }

        $newStatus = match ($eventType) {
            'transaction.approved' => 'approved',
            'transaction.declined', 'transaction.canceled' => 'failed',
            default => $transaction->status,
        };

        $transaction->update([
            'status' => $newStatus,
            'fedapay_payload' => $event->__toArray(true),
            'paid_at' => $newStatus === 'approved' ? now() : null,
        ]);

        $transaction->order->update([
            'payment_status' => $newStatus === 'approved' ? 'paye' : ($newStatus === 'failed' ? 'echoue' : 'en_attente'),
            ...($newStatus === 'approved' ? ['payment_method' => 'en_ligne', 'paid_at' => now()] : []),
        ]);

        $this->auditLog->log('payment.webhook_received', $transaction, ['status' => $newStatus]);

        if ($newStatus === 'approved') {
            $order = $transaction->order->fresh();
            rescue(fn () => $order->deliverer?->user?->notify(new PaymentValidatedForDeliverer($order)));
        }

        return response()->json(['message' => 'OK']);
    }

    /**
     * L'id de la transaction visée par l'événement. Le SDK expose object_id
     * directement sur les événements récents ; on retombe sur l'objet
     * imbriqué si jamais la charge utile a une autre forme.
     */
    private function extractTransactionId(Event $event): ?int
    {
        if (isset($event->object_id)) {
            return (int) $event->object_id;
        }

        $object = $event->object ?? null;
        if ($object instanceof FedaPayObject && isset($object->id)) {
            return (int) $object->id;
        }

        return null;
    }
}
