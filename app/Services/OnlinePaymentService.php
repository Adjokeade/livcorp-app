<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Paiement en ligne des livraisons, à la CRÉATION : l'argent reste bloqué sur le compte de LIV corp jusqu'à la
 * confirmation de réception, puis devient un solde pour le livreur (cf. CommissionService). Un seul paiement peut couvrir
 * plusieurs livraisons (envoi en lot). Utilisé par le retour du widget ET par le webhook : même résultat, une seule fois.
 */
class OnlinePaymentService
{
    public function __construct(
        private readonly KkiapayService $kkiapay,
        private readonly AuditLogService $auditLog,
        private readonly OrderDispatchService $dispatch,
    ) {}

    /** Transaction en attente couvrant ces livraisons (montant = somme des prix), reliée à chacune. */
    public function start(Collection $orders): Transaction
    {
        $transaction = Transaction::create([
            'order_id' => $orders->first()->id,
            'user_id' => $orders->first()->client_id,
            'provider' => 'kkiapay',
            'reference' => 'LIVP-'.strtoupper(Str::random(12)),
            'amount' => $orders->sum('price'),
            'currency' => 'XOF',
            'status' => 'pending',
        ]);

        Order::whereIn('id', $orders->pluck('id'))->update(['transaction_id' => $transaction->id]);

        return $transaction;
    }

    /** Reprise du paiement d'une livraison non payée : même tentative si elle est encore ouverte, sinon une nouvelle. */
    public function resume(Order $order): Transaction
    {
        $current = $order->payment;

        if ($current && $current->status === 'pending') {
            return $current;
        }

        return $this->start(collect([$order]));
    }

    /** @return array<string, mixed> ce dont le navigateur a besoin pour ouvrir le widget (jamais les clés privées) */
    public function widgetPayload(Transaction $transaction, User $client): array
    {
        $count = Order::where('transaction_id', $transaction->id)->count();

        return [
            'reference' => $transaction->reference,
            'amount' => (int) $transaction->amount,
            'description' => $count > 1 ? "LIV corp : {$count} livraisons" : 'Livraison LIV corp',
            'customer' => [
                'name' => trim($client->first_name.' '.$client->last_name),
                'email' => $client->email,
                'phone' => preg_replace('/\D+/', '', (string) $client->phone),
            ],
            ...$this->kkiapay->publicConfig(),
        ];
    }

    /**
     * Retour du widget : le navigateur annonce un identifiant de transaction KKiaPay, qu'on ne croit pas sur parole.
     *
     * @throws ValidationException identifiant déjà utilisé, ou montant / référence qui ne correspondent pas
     * @throws \RuntimeException si KKiaPay est injoignable (le webhook prendra le relais)
     */
    public function confirm(Transaction $transaction, string $providerTransactionId): Transaction
    {
        if ($transaction->status === 'approved') {
            return $transaction;
        }

        $reused = Transaction::where('provider_transaction_id', $providerTransactionId)->where('id', '!=', $transaction->id)->exists();
        if ($reused) {
            $this->auditLog->log('payment.reused_transaction', $transaction, ['provider_transaction_id' => $providerTransactionId]);
            throw ValidationException::withMessages(['transaction_id' => 'Cette transaction a déjà servi pour un autre paiement.']);
        }

        return $this->settle($transaction, $providerTransactionId, $this->kkiapay->verify($providerTransactionId));
    }

    /**
     * @param  array{status: string, amount: int|null, partner_id: string|null, source: string|null, raw: array}  $verified
     */
    public function settle(Transaction $transaction, string $providerTransactionId, array $verified): Transaction
    {
        if ($verified['status'] === 'SUCCESS') {
            // Un paiement réussi pour un autre montant ou une autre référence n'est PAS le bon : on le signale, on ne valide pas.
            $wrongAmount = $verified['amount'] !== (int) $transaction->amount;
            $wrongReference = $verified['partner_id'] !== null && $verified['partner_id'] !== $transaction->reference;

            if ($wrongAmount || $wrongReference) {
                Log::warning('Paiement KKiaPay incohérent', ['transaction' => $transaction->id, 'verified' => $verified['raw']]);
                $this->auditLog->log('payment.mismatch', $transaction, ['provider_transaction_id' => $providerTransactionId, 'amount' => $verified['amount']]);
                throw ValidationException::withMessages(['transaction_id' => 'Ce paiement ne correspond pas à cette commande.']);
            }

            return $this->markApproved($transaction, $providerTransactionId, $verified);
        }

        if (in_array($verified['status'], ['FAILED', 'INVALID_TRANSACTION', 'TRANSACTION_NOT_FOUND', 'REVERTED'], true)) {
            return $this->markFailed($transaction, $providerTransactionId, $verified);
        }

        return $transaction; // PENDING : le webhook confirmera
    }

    private function markApproved(Transaction $transaction, string $providerTransactionId, array $verified): Transaction
    {
        $published = DB::transaction(function () use ($transaction, $providerTransactionId, $verified) {
            $locked = Transaction::whereKey($transaction->id)->lockForUpdate()->first();
            if ($locked->status === 'approved') {
                return collect(); // déjà réglée (confirmation et webhook arrivés ensemble)
            }

            $locked->update([
                'status' => 'approved',
                'provider_transaction_id' => $providerTransactionId,
                'provider_payload' => $verified['raw'],
                'method' => ($verified['source'] ?? '') === 'CARD' ? 'carte' : 'mobile_money',
                'paid_at' => now(),
            ]);

            $orders = Order::where('transaction_id', $locked->id)->lockForUpdate()->get();
            // Une livraison annulée pendant que le client payait est payée quand même : elle sera remboursée plus bas.
            $orders->each->update(['payment_status' => 'paye', 'payment_method' => 'en_ligne', 'paid_at' => now()]);

            return $orders;
        });

        $this->auditLog->log('payment.online_confirmed', $transaction, ['amount' => $transaction->amount]);

        foreach ($published as $order) {
            $order = $order->fresh();
            if ($order->status === Order::STATUS_CREEE) {
                // La livraison est maintenant payée : seulement à cet instant elle devient visible des livreurs.
                rescue(fn () => $this->dispatch->publish($order));
            } elseif ($order->status === Order::STATUS_ANNULEE) {
                $this->refundOrder($order, 'Paiement reçu après l\'annulation de la livraison');
            }
        }

        return $transaction->fresh();
    }

    private function markFailed(Transaction $transaction, string $providerTransactionId, array $verified): Transaction
    {
        if ($transaction->status !== 'pending') {
            return $transaction;
        }

        $transaction->update(['status' => 'failed', 'provider_transaction_id' => $providerTransactionId, 'provider_payload' => $verified['raw']]);
        Order::where('transaction_id', $transaction->id)->where('payment_status', '!=', 'paye')->update(['payment_status' => 'echoue']);

        $this->auditLog->log('payment.online_failed', $transaction, ['reason' => $verified['failure'] ?? $verified['status']]);

        return $transaction->fresh();
    }

    /**
     * Rend son argent à l'expéditeur quand une livraison PAYÉE est annulée. Un paiement Mobile Money couvrant cette seule
     * livraison se rembourse par l'API ; tout le reste (carte, envoi en lot, panne de l'API) est signalé à l'administration,
     * qui le règle depuis le tableau de bord KKiaPay.
     *
     * @return array{status: 'none'|'done'|'manual', message: string}
     */
    public function refundOrder(Order $order, string $why): array
    {
        $transaction = $order->payment;

        // Espèces déjà remises au livreur : pas de transaction à rembourser, le livreur rend l'argent (à régler par l'équipe).
        if ($order->isCash() && $order->isPaid()) {
            $this->auditLog->log('payment.cash_refund_needed', $order, ['why' => $why]);

            return ['status' => 'manual', 'message' => 'Paiement en espèces : le remboursement se règle directement avec le livreur, notre équipe vous contacte.'];
        }

        if ($order->payment_status !== 'paye' || ! $transaction || $transaction->status !== 'approved') {
            return ['status' => 'none', 'message' => 'Aucun paiement à rembourser.'];
        }

        $coversOthers = Order::where('transaction_id', $transaction->id)->where('id', '!=', $order->id)->exists();

        if ($coversOthers || $transaction->method === 'carte' || ! $this->kkiapay->isConfigured()) {
            return $this->flagManualRefund($order, $transaction, $coversOthers
                ? 'Paiement groupé (envoi en lot) : remboursement partiel à faire depuis le tableau de bord KKiaPay.'
                : ($transaction->method === 'carte' ? 'Paiement par carte : à rembourser depuis le tableau de bord KKiaPay.' : 'KKiaPay non configuré.'));
        }

        try {
            $result = $this->kkiapay->refund((string) $transaction->provider_transaction_id);
        } catch (Throwable) {
            return $this->flagManualRefund($order, $transaction, 'KKiaPay injoignable : à rembourser depuis son tableau de bord.');
        }

        if (! $result['ok']) {
            return $this->flagManualRefund($order, $transaction, 'KKiaPay a refusé le remboursement ('.($result['status'] ?? 'erreur').').');
        }

        $transaction->update(['status' => 'refunded', 'refund_status' => 'done', 'refund_note' => $why]);
        $order->update(['payment_status' => 'rembourse']);
        $this->auditLog->log('payment.refunded', $transaction, ['order' => $order->reference, 'why' => $why]);

        return ['status' => 'done', 'message' => 'Le paiement vous a été remboursé par Mobile Money.'];
    }

    private function flagManualRefund(Order $order, Transaction $transaction, string $note): array
    {
        $transaction->update(['refund_status' => 'manual', 'refund_note' => $note]);
        $order->update(['payment_status' => 'rembourse']); // dû au client ; reste « à faire » côté finances tant que refund_status = manual
        $this->auditLog->log('payment.refund_manual', $transaction, ['order' => $order->reference, 'note' => $note]);

        return ['status' => 'manual', 'message' => 'Votre remboursement est en cours de traitement par notre équipe.'];
    }

    /** Livraison créée mais jamais payée : annulée, et sa tentative de paiement fermée. */
    public function cancelUnpaid(Order $order): void
    {
        if ($order->transaction_id) {
            Transaction::whereKey($order->transaction_id)->where('status', 'pending')->update(['status' => 'cancelled']);
        }
    }
}
