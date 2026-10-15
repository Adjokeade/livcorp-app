<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Transaction;
use App\Services\KkiapayService;
use App\Services\OnlinePaymentService;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Paiement des livraisons, à la CRÉATION. Le client règle en ligne (KKiaPay : Mobile Money ou carte) ; l'argent reste
 * bloqué chez LIV corp jusqu'à la confirmation de réception, puis devient un solde pour le livreur. Plus de paiement
 * à la remise ni en espèces : le destinataire n'a pas besoin d'avoir l'application.
 */
class PaymentController extends Controller
{
    public function __construct(
        private readonly KkiapayService $kkiapay,
        private readonly OnlinePaymentService $payments,
    ) {}

    /** Reprise du paiement d'une livraison créée mais pas encore payée (widget fermé, paiement échoué…). */
    public function store(Request $request, Order $order)
    {
        $this->authorize('view', $order); // le client ne paie que SES livraisons

        if ($order->status !== Order::STATUS_CREEE) {
            return response()->json(['message' => 'Cette livraison n\'est plus en attente de paiement.'], 422);
        }

        if ($order->isPaid()) {
            return response()->json(['message' => 'Cette livraison est déjà payée.'], 409);
        }

        if ($order->isCash()) {
            return response()->json(['message' => 'Cette livraison se paie en espèces au livreur, à la récupération du colis.'], 422);
        }

        if (! $this->kkiapay->isConfigured()) {
            return response()->json(['message' => 'Le paiement en ligne est momentanément indisponible. Réessayez dans quelques instants.'], 502);
        }

        $transaction = $this->payments->resume($order);
        $order->update(['payment_status' => 'en_attente']);

        return response()->json(['order' => $order->fresh(), 'payment' => $this->payments->widgetPayload($transaction, $request->user())]);
    }

    /**
     * Retour du widget KKiaPay : le navigateur donne l'identifiant de la transaction, le serveur la vérifie auprès de
     * KKiaPay (existence, réussite, montant, référence) avant de marquer les livraisons payées et de les publier.
     */
    public function confirm(Request $request)
    {
        $validated = $request->validate([
            'reference' => 'required|string|max:40',
            'transaction_id' => 'required|string|max:100',
        ]);

        $transaction = Transaction::where('reference', $validated['reference'])->first();
        abort_unless($transaction, 404, 'Paiement introuvable.');

        // Le payeur, ou un responsable de la même entreprise : comme pour la visibilité des livraisons.
        abort_unless($request->user()->canActForClient((int) $transaction->user_id), 403);

        try {
            $transaction = $this->payments->confirm($transaction, $validated['transaction_id']);
        } catch (RuntimeException) {
            // KKiaPay injoignable : le webhook confirmera dès que possible, la page de suivi se met à jour toute seule.
            return response()->json(['status' => 'pending'], 202);
        }

        return response()->json([
            'status' => $transaction->status,
            'orders' => Order::where('transaction_id', $transaction->id)->get(),
        ]);
    }
}
