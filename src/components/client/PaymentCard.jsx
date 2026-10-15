import { useEffect, useRef, useState } from 'react';
import clientOrderService from '../../services/clientOrderService';
import { openKkiapayPayment } from '../../lib/loadKkiapay';
import { formatFcfa } from '../../lib/format';
import Button from '../common/Button';
import Card from '../common/Card';

// Paiement à la CRÉATION : la livraison n'est publiée aux livreurs qu'une fois payée (Mobile Money ou carte, via
// KKiaPay). L'argent reste bloqué chez LIV corp jusqu'à ce que l'expéditeur confirme la réception, puis il devient un
// solde pour le livreur. Cette carte propose de payer tant que ce n'est pas fait, puis explique où est l'argent.
export default function PaymentCard({ order, delivererName, onPaid, autoPay = false }) {
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState('');
  const autoStarted = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const amount = formatFcfa(order.price);
  const unpaid = Boolean(order.awaiting_payment); // en attente d'un paiement EN LIGNE (les espèces ne s'attendent pas)
  const who = delivererName ?? 'le livreur';

  async function confirmWithServer(reference, transactionId) {
    setAwaiting(true);
    try {
      const result = await clientOrderService.confirmPayment(reference, transactionId);
      if (result.status === 'approved') {
        setAwaiting(false);
        onPaidRef.current({ payment_status: 'paye' });
      } else if (result.status === 'failed') {
        setAwaiting(false);
        setError("Le paiement n'a pas abouti. Vous pouvez réessayer.");
      }
      // 'pending' : « confirmation en cours », la page se met à jour dès que KKiaPay confirme (webhook).
    } catch (err) {
      setAwaiting(false);
      setError(err.response?.data?.errors?.transaction_id?.[0] ?? err.response?.data?.message ?? 'Impossible de confirmer le paiement. Contactez-nous si vous avez été débité.');
    }
  }

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const { payment } = await clientOrderService.pay(order.id);
      await openKkiapayPayment(payment, {
        onSuccess: (transactionId) => confirmWithServer(payment.reference, transactionId),
        onFailed: () => setError('Le paiement a échoué ou a été annulé. Vous pouvez réessayer.'),
      });
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? 'Le paiement en ligne est indisponible.');
    } finally {
      setBusy(false);
    }
  }

  // Juste après la création d'une livraison, le widget s'ouvre tout seul (une seule fois).
  useEffect(() => {
    if (autoPay && unpaid && !autoStarted.current) {
      autoStarted.current = true;
      pay();
    }
  }, [autoPay, unpaid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (unpaid) {
    return (
      <Card className="border-2 border-primary">
        <h2 className="font-display text-lg font-bold">Payez pour publier votre livraison</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Tant qu'elle n'est pas payée, aucun livreur ne la voit. Montant : <strong className="text-on-surface">{amount}</strong>, par Mobile Money ou carte.
        </p>
        <p className="mt-2 rounded bg-primary-fixed px-3 py-2 text-xs text-on-primary-fixed-variant">
          Votre argent reste bloqué en sécurité chez LIV corp. Le livreur n'est payé qu'après la confirmation de la réception du colis, et vous êtes remboursé si la livraison est annulée.
        </p>

        {order.payment_status === 'echoue' && !error && (
          <p className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">Le dernier paiement n'a pas abouti. Réessayez.</p>
        )}
        {awaiting && (
          <p role="status" className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            Paiement envoyé, confirmation en cours… Cette page se met à jour toute seule.
          </p>
        )}
        {error && <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

        <Button onClick={pay} disabled={busy || awaiting} className="mt-4 w-full">
          {busy ? 'Ouverture…' : `Payer ${amount}`}
        </Button>
      </Card>
    );
  }

  // Paiement en espèces : remis au livreur au retrait du colis, qui le confirme dans l'application.
  if (order.payment_method === 'especes' && order.status !== 'annulee') {
    return order.payment_status === 'paye' ? (
      <Card>
        <h2 className="text-sm font-semibold text-on-surface-variant">PAIEMENT EN ESPÈCES</h2>
        <p className="mt-2 text-sm">
          <strong>{amount}</strong> remis en espèces à {who}, qui a confirmé les avoir reçus. Rien d'autre à payer.
        </p>
      </Card>
    ) : (
      <Card className="border-2 border-primary">
        <h2 className="font-display text-lg font-bold">À payer en espèces au livreur</h2>
        <p className="mt-1 text-sm">
          Remettez <strong>{amount}</strong> à {who}, <strong>en main propre, quand il vient récupérer le colis</strong>. Il le confirmera dans l'application avant de partir avec votre colis.
        </p>
        <p className="mt-2 rounded bg-primary-fixed px-3 py-2 text-xs text-on-primary-fixed-variant">
          Ne payez qu'au livreur de cette livraison, et uniquement une fois qu'il est devant vous. Vous recevrez une notification quand il aura confirmé l'encaissement.
        </p>
      </Card>
    );
  }

  if (order.payment_status === 'rembourse') {
    return (
      <Card>
        <h2 className="font-display text-lg font-bold">Paiement remboursé</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Les {amount} que vous aviez payés vous sont rendus. Si vous ne les voyez pas sous quelques jours, contactez-nous.</p>
      </Card>
    );
  }

  if (order.payment_status !== 'paye') return null;

  if (order.status === 'livree') {
    return (
      <Card>
        <h2 className="font-display text-lg font-bold text-primary">Livraison terminée</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{amount} réglés. Réception confirmée : votre livreur a été payé.</p>
      </Card>
    );
  }

  if (order.status === 'annulee') return null;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-on-surface-variant">PAIEMENT SÉCURISÉ</h2>
      <p className="mt-2 text-sm">
        <strong>{amount}</strong> payés, bloqués chez LIV corp. Votre livreur ne les reçoit qu'<strong>après votre confirmation de réception</strong> du colis.
      </p>
    </Card>
  );
}
