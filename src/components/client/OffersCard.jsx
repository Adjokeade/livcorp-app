import { useState } from 'react';
import clientOrderService from '../../services/clientOrderService';
import { formatFcfa } from '../../lib/format';
import Button from '../common/Button';
import Card from '../common/Card';
import Stars from '../common/Stars';

// Propositions de prix des livreurs.
//  - course encore libre : accepter fixe le prix et assigne ce livreur ;
//  - course déjà acceptée : le livreur assigné demande une révision (colis plus lourd que prévu…),
//    accepter ne change que le prix.
export default function OffersCard({ order, onAccepted, onDeclined }) {
  const [busy, setBusy] = useState(null); // `${offerId}:accept|decline`
  const [error, setError] = useState('');
  const offers = order.offers ?? [];
  const isRevision = order.status === 'acceptee';

  if (isRevision && offers.length === 0) return null;
  if (!isRevision && order.status !== 'creee') return null;

  async function respond(offer, action) {
    setBusy(`${offer.id}:${action}`);
    setError('');
    try {
      if (action === 'accept') {
        const { order: updated } = await clientOrderService.acceptOffer(order.id, offer.id);
        onAccepted(updated);
      } else {
        await clientOrderService.declineOffer(order.id, offer.id);
        onDeclined(offer.id);
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Action impossible. Réessayez.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">
        {isRevision
          ? 'Votre livreur demande un nouveau prix'
          : offers.length > 0
            ? `Propositions des livreurs (${offers.length})`
            : 'En attente d\'un livreur'}
      </h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        {isRevision
          ? `Prix actuel : ${formatFcfa(order.price)}. Vous restez libre de refuser : la course continue alors au prix convenu.`
          : offers.length > 0
            ? `Votre prix : ${formatFcfa(order.price)}. Acceptez une proposition, ou laissez les livreurs accepter votre prix.`
            : `Les livreurs voient votre photo et votre prix de ${formatFcfa(order.price)}. Ils peuvent l'accepter ou vous proposer un autre montant.`}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {offers.map((offer) => {
          const diff = Number(offer.amount) - Number(order.price);
          return (
            <div key={offer.id} className="rounded-lg border border-outline-variant p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{offer.deliverer?.user?.first_name ?? 'Livreur'}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                    {Number(offer.deliverer?.average_rating) > 0 ? (
                      <>
                        <Stars value={offer.deliverer.average_rating} />
                        <span>{Number(offer.deliverer.average_rating).toFixed(1)}/5</span>
                      </>
                    ) : (
                      <span>Nouveau livreur</span>
                    )}
                    <span>· {offer.deliverer?.total_deliveries ?? 0} livraison{offer.deliverer?.total_deliveries > 1 ? 's' : ''}</span>
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-display text-lg font-bold text-primary">{formatFcfa(offer.amount)}</p>
                  <p className={`text-xs font-semibold ${diff > 0 ? 'text-error' : 'text-primary'}`}>
                    {diff > 0 ? '+' : '−'} {formatFcfa(Math.abs(diff))}
                  </p>
                </div>
              </div>

              {offer.message && (
                <p className="mt-2 whitespace-pre-wrap break-words rounded bg-surface-container px-3 py-2 text-sm">
                  « {offer.message} »
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => respond(offer, 'decline')}
                  disabled={busy !== null}
                  className="flex-1"
                >
                  {busy === `${offer.id}:decline` ? '…' : 'Refuser'}
                </Button>
                <Button onClick={() => respond(offer, 'accept')} disabled={busy !== null} className="flex-1">
                  {busy === `${offer.id}:accept` ? '…' : isRevision ? 'Accepter le prix' : 'Accepter'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
