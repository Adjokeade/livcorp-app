import { useState } from 'react';
import clientOrderService from '../../services/clientOrderService';
import { loadFedaPayCheckout } from '../../lib/loadFedaPayCheckout';
import { formatFcfa } from '../../lib/format';
import Button from '../common/Button';
import Card from '../common/Card';

// Paiement à la réception : le client le valide dans l'app, devant le livreur, qui en voit
// aussitôt le statut. Deux modes : en ligne (FedaPay) ou en espèces (confirmation du client).
// Le parent relit la commande toutes les quelques secondes : c'est lui qui bascule cette carte
// sur "Paiement validé" (confirmation FedaPay par webhook comprise).
export default function PaymentCard({ order, delivererName, onPaid }) {
  const [busy, setBusy] = useState(null); // 'especes' | 'en_ligne'
  const [confirmingCash, setConfirmingCash] = useState(false);
  const [awaitingOnline, setAwaitingOnline] = useState(false);
  const [error, setError] = useState('');

  const amount = formatFcfa(order.price);
  const who = delivererName ?? 'votre livreur';

  if (order.payment_status === 'paye') {
    return (
      <Card>
        <h2 className="font-display text-lg font-bold text-primary">Paiement validé</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {amount} réglés {order.payment_method === 'especes' ? 'en espèces' : 'en ligne'}.
          {order.status === 'livree' ? '' : ' Votre livreur peut finaliser la livraison.'}
        </p>
      </Card>
    );
  }

  // Avant que le livreur soit en route : on annonce simplement la règle.
  if (order.status !== 'en_cours_livraison') {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-on-surface-variant">PAIEMENT À LA RÉCEPTION</h2>
        <p className="mt-2 text-sm">
          Vous réglerez <strong>{amount}</strong> à la remise du colis, devant votre livreur : Mobile Money, carte ou
          espèces. Rien à payer maintenant.
        </p>
      </Card>
    );
  }

  async function payCash() {
    setBusy('especes');
    setError('');
    try {
      const { order: paid } = await clientOrderService.pay(order.id, 'especes');
      onPaid(paid);
    } catch (err) {
      setError(err.response?.data?.message ?? "Impossible de valider le paiement. Réessayez.");
    } finally {
      setBusy(null);
      setConfirmingCash(false);
    }
  }

  async function payOnline() {
    setBusy('en_ligne');
    setError('');
    try {
      const { payment } = await clientOrderService.pay(order.id, 'en_ligne');
      const FedaPay = await loadFedaPayCheckout();
      FedaPay.init({
        public_key: import.meta.env.VITE_FEDAPAY_PUBLIC_KEY,
        transaction: {
          id: payment.fedapay_transaction_id,
          amount: Number(order.price),
          description: `Commande LIV corp #${order.reference}`,
        },
        onComplete(response) {
          if (response.reason === FedaPay.CHECKOUT_COMPLETED) setAwaitingOnline(true);
        },
      }).open();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? 'Le paiement en ligne est indisponible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Validez le paiement</h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        {who} est en route. À la remise du colis, réglez <strong className="text-on-surface">{amount}</strong> devant
        {who === 'votre livreur' ? ' lui' : ` ${who}`} : il voit le statut immédiatement.
      </p>

      {order.payment_status === 'echoue' && (
        <p className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          Le dernier paiement en ligne a échoué. Réessayez ou payez en espèces.
        </p>
      )}

      {awaitingOnline && (
        <p role="status" className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Paiement envoyé, confirmation en cours… Cette page se met à jour toute seule.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      {confirmingCash ? (
        <div className="mt-4 rounded border border-outline-variant p-3">
          <p className="text-sm font-semibold">
            Confirmez-vous avoir remis {amount} en espèces à {who} ?
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmingCash(false)} disabled={busy !== null} className="flex-1">
              Pas encore
            </Button>
            <Button onClick={payCash} disabled={busy !== null} className="flex-1">
              {busy === 'especes' ? 'Validation…' : 'Oui, valider'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={payOnline} disabled={busy !== null || awaitingOnline} className="w-full">
            {busy === 'en_ligne' ? 'Ouverture…' : 'Payer par Mobile Money ou carte'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setConfirmingCash(true)}
            disabled={busy !== null || awaitingOnline}
            className="w-full"
          >
            Je paie en espèces
          </Button>
        </div>
      )}
    </Card>
  );
}
