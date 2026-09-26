import { useState } from 'react';
import { Link } from 'react-router-dom';
import clientOrderService from '../../services/clientOrderService';
import Button from '../common/Button';
import Card from '../common/Card';

// Le livreur n'a pas pu remettre le colis : le destinataire était injoignable. Le client confirme qu'il l'est
// désormais pour relancer la livraison ; sinon l'équipe prend le relais.
export default function UnreachableCard({ order, delivererName, onRetried }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (order.status !== 'litige' || !order.failed_delivery_at) return null;

  async function retry() {
    setBusy(true);
    setError('');
    try {
      onRetried(await clientOrderService.retryDelivery(order.id));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Impossible de relancer la livraison. Réessayez.');
      setBusy(false);
    }
  }

  return (
    <Card className="border-2 border-primary">
      <h2 className="font-display text-lg font-bold">Livraison en attente</h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        {delivererName ?? 'Votre livreur'} est arrivé mais n'a pas pu joindre le destinataire, malgré l'attente. Si le
        destinataire est joignable maintenant, relancez la livraison : le livreur revient avec votre colis.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
      <Button onClick={retry} disabled={busy} className="mt-4 w-full">
        {busy ? 'Envoi…' : 'Le destinataire est joignable, réessayer'}
      </Button>
      <p className="mt-3 text-center text-xs text-on-surface-variant">
        Un souci ? Notre équipe est prévenue.{' '}
        <Link to="/contact" className="font-semibold text-secondary underline">
          Nous écrire
        </Link>
      </p>
    </Card>
  );
}
