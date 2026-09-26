<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Notifications\PaymentValidatedForDeliverer;
use App\Services\AuditLogService;
use App\Services\FedaPayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Paiement à la réception du colis : le client le valide dans l'app, devant le
 * livreur, qui en voit aussitôt le statut (et ne peut clôturer la course avant).
 *  - "especes"  : le client confirme avoir remis la somme au livreur ;
 *  - "en_ligne" : transaction FedaPay (Mobile Money / carte), confirmée par webhook.
 */
class PaymentController extends Controller
{
    public function __construct(
        private readonly FedaPayService $fedapay,
        private readonly AuditLogService $auditLog,
    ) {}

    public function store(Request $request, Order $order)
    {
        $this->authorize('view', $order); // le client ne paie que SES commandes

        $validated = $request->validate(['method' => 'required|in:especes,en_ligne']);

        if ($order->isPaid()) {
            return response()->json(['message' => 'Cette commande est déjà payée.'], 409);
        }

        if ($order->status !== Order::STATUS_EN_COURS_LIVRAISON) {
            return response()->json([
                'message' => 'Le paiement se valide à la réception du colis, quand votre livreur est en route vers vous.',
            ], 422);
        }

        return $validated['method'] === 'especes'
            ? $this->payInCash($order)
            : $this->startOnlinePayment($order);
    }

    private function payInCash(Order $order)
    {
        // Verrou : deux validations simultanées ne doivent pas s'enchaîner.
        $paid = DB::transaction(function () use ($order) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->first();
            if ($locked->isPaid()) {
                return null;
            }

            $locked->update(['payment_status' => 'paye', 'payment_method' => 'especes', 'paid_at' => now()]);

            return $locked;
        });

        if (! $paid) {
            return response()->json(['message' => 'Cette commande est déjà payée.'], 409);
        }

        $this->auditLog->log('payment.cash_validated', $paid, ['amount' => $paid->price]);

        // Le livreur voit le statut dans l'app, et reçoit aussi la notification s'il l'a fermée.
        rescue(fn () => $paid->deliverer?->user?->notify(new PaymentValidatedForDeliverer($paid)));

        return response()->json(['order' => $paid]);
    }

    private function startOnlinePayment(Order $order)
    {
        // Une tentative encore ouverte est reprise plutôt que dupliquée.
        $transaction = $order->transactions()->where('status', 'pending')->latest()->first();

        if (! $transaction) {
            try {
                $transaction = $this->fedapay->createTransactionForOrder($order->load('client'));
            } catch (RuntimeException) {
                return response()->json([
                    'message' => 'Le paiement en ligne est momentanément indisponible. Vous pouvez payer en espèces.',
                ], 502);
            }
        }

        $order->update(['payment_method' => 'en_ligne', 'payment_status' => 'en_attente']);

        return response()->json(['order' => $order->fresh(), 'payment' => $transaction]);
    }
}
