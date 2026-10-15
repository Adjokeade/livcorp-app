<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Intégration KKiaPay (Mobile Money MTN / Moov, carte bancaire).
 *
 * Le client règle dans le widget KKiaPay (ouvert dans le navigateur avec la seule clé PUBLIQUE) ; le serveur ne fait
 * JAMAIS confiance à ce que dit le navigateur : il interroge l'API KKiaPay avec les clés privée et secrète pour
 * vérifier que la transaction existe, qu'elle a réussi et que le montant est bon (cf. OnlinePaymentService).
 *
 * KKiaPay n'offre pas d'API de versement vers des tiers : les versements aux livreurs sont payés par l'administration
 * (cf. FinanceController::payPayout).
 */
class KkiapayService
{
    private const LIVE_URL = 'https://api.kkiapay.me';

    private const SANDBOX_URL = 'https://api-sandbox.kkiapay.me';

    public function isConfigured(): bool
    {
        return filled(config('services.kkiapay.public_key'))
            && filled(config('services.kkiapay.private_key'))
            && filled(config('services.kkiapay.secret'));
    }

    /** Ce que le navigateur a besoin de savoir pour ouvrir le widget : la clé publique, jamais les clés privées. */
    public function publicConfig(): array
    {
        return [
            'public_key' => config('services.kkiapay.public_key'),
            'sandbox' => (bool) config('services.kkiapay.sandbox'),
        ];
    }

    /** Le secret hash saisi dans le tableau de bord KKiaPay accompagne chaque webhook (en-tête x-kkiapay-secret). */
    public function webhookSecretMatches(?string $received): bool
    {
        $expected = (string) config('services.kkiapay.webhook_secret');

        return $expected !== '' && is_string($received) && hash_equals($expected, $received);
    }

    /**
     * État réel d'une transaction chez KKiaPay.
     *
     * @return array{status: string, amount: int|null, partner_id: string|null, source: string|null, failure: string|null, raw: array}
     *
     * @throws RuntimeException si KKiaPay ne répond pas ou ne connaît pas la transaction
     */
    public function verify(string $transactionId): array
    {
        $this->ensureConfigured();

        try {
            $response = $this->client()
                ->withHeaders([
                    'X-PRIVATE-KEY' => (string) config('services.kkiapay.private_key'),
                    'X-SECRET-KEY' => (string) config('services.kkiapay.secret'),
                ])
                ->post($this->baseUrl().'/api/v1/transactions/status', ['transactionId' => $transactionId]);
        } catch (Throwable $e) {
            Log::error('KKiaPay : vérification impossible', ['transaction' => $transactionId, 'error' => $e->getMessage()]);
            throw new RuntimeException('KKiaPay est injoignable.', previous: $e);
        }

        $data = $response->json();

        if (! $response->successful() || ! is_array($data) || ! isset($data['status'])) {
            Log::warning('KKiaPay : transaction non vérifiable', ['transaction' => $transactionId, 'http' => $response->status()]);
            throw new RuntimeException('Transaction introuvable chez KKiaPay.');
        }

        return [
            'status' => strtoupper((string) $data['status']),
            'amount' => isset($data['amount']) ? (int) round((float) $data['amount']) : null,
            'partner_id' => isset($data['partnerId']) && $data['partnerId'] !== '' ? (string) $data['partnerId'] : null,
            'source' => $data['source'] ?? null,
            'failure' => $data['failureMessage'] ?? null,
            'raw' => $data,
        ];
    }

    /**
     * Annule une transaction Mobile Money réussie et rembourse le client (les frais ne sont pas remboursés).
     * Les paiements par carte ne se remboursent pas par l'API.
     *
     * @return array{ok: bool, status: string|null, raw: array}
     */
    public function refund(string $transactionId): array
    {
        $this->ensureConfigured();

        try {
            $response = $this->client()->post($this->baseUrl().'/api/v1/transactions/revert', ['transactionId' => $transactionId]);
        } catch (Throwable $e) {
            Log::error('KKiaPay : remboursement impossible', ['transaction' => $transactionId, 'error' => $e->getMessage()]);
            throw new RuntimeException('KKiaPay est injoignable.', previous: $e);
        }

        $data = (array) $response->json();
        $status = isset($data['status']) ? strtoupper((string) $data['status']) : null;

        return ['ok' => $response->successful() && in_array($status, ['SUCCESS', 'REVERTED'], true), 'status' => $status, 'raw' => $data];
    }

    private function client(): PendingRequest
    {
        return Http::timeout(10)->retry(2, 300, throw: false)->acceptJson()
            ->withHeaders(['X-API-KEY' => (string) config('services.kkiapay.public_key')]);
    }

    private function baseUrl(): string
    {
        return config('services.kkiapay.sandbox') ? self::SANDBOX_URL : self::LIVE_URL;
    }

    private function ensureConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('KKiaPay n\'est pas configuré.');
        }
    }
}
