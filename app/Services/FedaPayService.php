<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Transaction;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Service d'intégration FedaPay (paiement Mobile Money / carte bancaire).
 *
 * Exigence sécurité :
 *  - La clé secrète FedaPay ne quitte JAMAIS le backend (jamais exposée au frontend).
 *  - Toute transaction est créée côté serveur.
 *  - Chaque webhook est vérifié par signature avant traitement (cf. handleWebhook).
 */
class FedaPayService
{
    private string $baseUrl;
    private ?string $secretKey;

    public function __construct()
    {
        $env = config('services.fedapay.env', 'sandbox');
        $this->baseUrl = $env === 'live'
            ? 'https://api.fedapay.com/v1'
            : 'https://sandbox-api.fedapay.com/v1';
        $this->secretKey = config('services.fedapay.secret_key');
    }

    /**
     * Crée une transaction FedaPay pour une commande et retourne l'URL de paiement à afficher au client.
     */
    public function createTransactionForOrder(Order $order): Transaction
    {
        $response = Http::withToken($this->secretKey)
            ->post("{$this->baseUrl}/transactions", [
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

        if ($response->failed()) {
            Log::error('FedaPay: échec création transaction', ['order_id' => $order->id, 'body' => $response->body()]);
            throw new RuntimeException('Impossible de créer la transaction de paiement.');
        }

        $data = $response->json('v1/transaction') ?? $response->json();

        return Transaction::create([
            'order_id' => $order->id,
            'user_id' => $order->client_id,
            'fedapay_transaction_id' => $data['id'] ?? null,
            'amount' => $order->price,
            'currency' => 'XOF',
            'status' => 'pending',
            'fedapay_payload' => $data,
        ]);
    }

    /**
     * Vérifie la signature d'un webhook FedaPay avant tout traitement.
     * Cf. exigence sécurité : "vérification de signature des webhooks FedaPay avant tout traitement".
     */
    public function verifyWebhookSignature(string $payload, string $signatureHeader): bool
    {
        $secret = config('services.fedapay.webhook_secret');
        $expected = hash_hmac('sha256', $payload, $secret);

        return hash_equals($expected, $signatureHeader);
    }

    /**
     * Déclenche un reversement (payout) Mobile Money vers un livreur/commerçant.
     */
    public function createPayout(string $mobileMoneyNumber, float $amount, string $description): array
    {
        $response = Http::withToken($this->secretKey)
            ->post("{$this->baseUrl}/payouts", [
                'amount' => (int) $amount,
                'currency' => ['iso' => 'XOF'],
                'description' => $description,
                'customer' => [
                    'phone_number' => ['number' => $mobileMoneyNumber, 'country' => 'bj'],
                ],
            ]);

        if ($response->failed()) {
            Log::error('FedaPay: échec du payout', ['body' => $response->body()]);
            throw new RuntimeException('Le reversement a échoué.');
        }

        return $response->json();
    }
}
