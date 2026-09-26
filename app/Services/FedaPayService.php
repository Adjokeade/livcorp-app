<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Transaction;
use FedaPay\Error\SignatureVerification;
use FedaPay\Event;
use FedaPay\FedaPay as FedaPayClient;
use FedaPay\Payout as FedaPayPayout;
use FedaPay\Transaction as FedaPayTransaction;
use FedaPay\Webhook;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Service d'intégration FedaPay (paiement Mobile Money / carte bancaire),
 * via le SDK officiel fedapay/fedapay-php (plutôt que des appels HTTP faits
 * à la main : le SDK gère correctement le format réel de réponse de l'API
 * et le format exact de signature des webhooks — cf. lib/WebhookSignature.php
 * du SDK, schéma "t=<timestamp>,s=<hmac>", absent de toute tentative manuelle).
 *
 * Exigence sécurité :
 *  - La clé secrète FedaPay ne quitte JAMAIS le backend (jamais exposée au frontend).
 *  - Toute transaction est créée côté serveur.
 *  - Chaque webhook est vérifié par signature avant traitement (cf. constructWebhookEvent).
 */
class FedaPayService
{
    public function __construct()
    {
        FedaPayClient::setApiKey((string) config('services.fedapay.secret_key'));
        FedaPayClient::setEnvironment(config('services.fedapay.env', 'sandbox'));
    }

    /**
     * Crée une transaction FedaPay pour une commande. Le frontend utilise
     * l'id renvoyé pour ouvrir le widget Checkout.js (cf. transaction.id).
     */
    public function createTransactionForOrder(Order $order): Transaction
    {
        try {
            $fedapayTransaction = FedaPayTransaction::create([
                'description' => "Commande LIV corp #{$order->reference}",
                'amount' => (int) $order->price, // FedaPay attend un montant entier (XOF)
                'currency' => ['iso' => 'XOF'],
                'callback_url' => config('app.frontend_url')."/commandes/{$order->reference}/paiement/retour",
                'customer' => [
                    'firstname' => $order->client->first_name,
                    'lastname' => $order->client->last_name,
                    'email' => $order->client->email,
                    'phone_number' => ['number' => $order->client->phone, 'country' => 'bj'],
                ],
            ]);
        } catch (Throwable $e) {
            Log::error('FedaPay: échec création transaction', ['order_id' => $order->id, 'error' => $e->getMessage()]);
            throw new RuntimeException('Impossible de créer la transaction de paiement.', previous: $e);
        }

        return Transaction::create([
            'order_id' => $order->id,
            'user_id' => $order->client_id,
            'fedapay_transaction_id' => $fedapayTransaction->id,
            'amount' => $order->price,
            'currency' => 'XOF',
            'status' => 'pending',
            'fedapay_payload' => $fedapayTransaction->__toArray(true),
        ]);
    }

    /**
     * Vérifie la signature d'un webhook FedaPay (en-tête X-FEDAPAY-SIGNATURE,
     * format "t=<timestamp>,s=<signature>") et retourne l'événement décodé.
     * Cf. exigence sécurité : "vérification de signature des webhooks FedaPay avant tout traitement".
     *
     * @throws SignatureVerification si la signature est absente/invalide/expirée.
     */
    public function constructWebhookEvent(string $payload, string $signatureHeader): Event
    {
        return Webhook::constructEvent(
            $payload,
            $signatureHeader,
            (string) config('services.fedapay.webhook_secret'),
        );
    }

    /**
     * Déclenche un reversement (payout) Mobile Money vers un livreur/commerçant.
     * Le SDK sépare la création de la ressource Payout et son envoi effectif
     * (sendNow), cf. lib/Payout.php du SDK.
     */
    public function createPayout(string $mobileMoneyNumber, float $amount, string $description): array
    {
        try {
            $payout = FedaPayPayout::create([
                'amount' => (int) $amount,
                'currency' => ['iso' => 'XOF'],
                'description' => $description,
                'customer' => [
                    'phone_number' => ['number' => $mobileMoneyNumber, 'country' => 'bj'],
                ],
            ]);

            $result = $payout->sendNow(['phone_number' => ['number' => $mobileMoneyNumber, 'country' => 'bj']]);
        } catch (Throwable $e) {
            Log::error('FedaPay: échec du payout', ['error' => $e->getMessage()]);
            throw new RuntimeException('Le reversement a échoué.', previous: $e);
        }

        return $result->__toArray(true);
    }
}
