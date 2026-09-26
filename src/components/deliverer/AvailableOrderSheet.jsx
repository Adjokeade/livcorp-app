import { useEffect, useState } from 'react';
import Sheet from '../common/Sheet';
import Button from '../common/Button';
import RouteMap from '../client/RouteMap';
import PriceOfferForm from './PriceOfferForm';
import RouteInfo from './RouteInfo';
import { formatDuration, formatFcfa, formatKm, timeAgo } from '../../lib/format';

// Fiche détaillée d'une course libre, côté livreur : photo, carte, adresses exactes avec repères, consignes,
// puis les deux façons de répondre : accepter au prix du client, ou proposer le sien.
// Le formulaire garde sa saisie tant que la liste est relue en arrière-plan (la fiche reste montée).
export default function AvailableOrderSheet({ open, order, busy, unavailableReason, onClose, onAccept, onOffer, onWithdraw }) {
  const [offering, setOffering] = useState(false);
  const orderId = order?.id;

  // Une autre course s'ouvre : on repart d'un formulaire fermé.
  useEffect(() => setOffering(false), [orderId]);

  if (!order) {
    return (
      <Sheet open={open} onClose={onClose} title="Course indisponible">
        <p className="text-sm text-on-surface-variant">
          {unavailableReason === 'mine'
            ? 'Vous avez accepté cette course : retrouvez-la dans « Mes courses ».'
            : "Cette course n'est plus disponible : elle a été acceptée par un autre livreur ou annulée."}
        </p>
        <Button onClick={onClose} className="mt-4 w-full">
          Voir les autres courses
        </Button>
      </Sheet>
    );
  }

  const offer = order.my_offer;
  const hasPending = offer?.status === 'pending';

  async function submitOffer(amount, message) {
    await onOffer(order.id, amount, message);
    setOffering(false);
  }

  const rows = [
    ['Distance', order.distance_km != null ? `${formatKm(order.distance_km)}${order.duration_min ? ` · environ ${formatDuration(order.duration_min)}` : ''}` : null],
    ['Urgence', order.urgency === 'express' ? 'Express (prioritaire)' : 'Standard'],
    ['Description', order.package_type],
    ['Publiée', `${timeAgo(order.created_at)}${order.client_first_name ? ` par ${order.client_first_name}` : ''}`],
    ['Propositions en cours', order.offers_count > 0 ? String(order.offers_count) : 'Aucune pour le moment'],
    ['Paiement', 'À la réception, devant vous'],
  ].filter(([, value]) => value);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${order.type === 'course' ? 'Course' : 'Colis'} #${order.reference}`}
      subtitle={`${formatKm(order.distance_km)} · ${timeAgo(order.created_at)}`}
      footer={
        offering ? null : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => onAccept(order.id)} disabled={busy} className="flex-1">
              {busy ? '…' : `Accepter à ${formatFcfa(order.price)}`}
            </Button>
            {!hasPending && (
              <Button variant="secondary" onClick={() => setOffering(true)} disabled={busy} className="flex-1">
                Proposer un autre prix
              </Button>
            )}
          </div>
        )
      }
    >
      {order.photo_url && (
        <a href={order.photo_url} target="_blank" rel="noreferrer" aria-label="Voir la photo du colis en grand">
          <img src={order.photo_url} alt="Photo du colis" className="max-h-72 w-full rounded-lg bg-surface-container object-contain" />
        </a>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <p className="font-display text-3xl font-extrabold text-primary">{formatFcfa(order.price)}</p>
        <p className="text-sm text-on-surface-variant">
          gain estimé <strong className="text-on-surface">{formatFcfa(order.estimated_earnings)}</strong>
        </p>
      </div>

      {order.pickup_lat && order.dropoff_lat && (
        <div className="mt-4">
          <RouteMap
            readOnly
            className="h-52 sm:h-64"
            pickup={{ lat: Number(order.pickup_lat), lng: Number(order.pickup_lng) }}
            dropoff={{ lat: Number(order.dropoff_lat), lng: Number(order.dropoff_lng) }}
          />
        </div>
      )}

      <div className="mt-4">
        <RouteInfo order={order} />
      </div>

      {order.instructions && (
        <p className="mt-4 break-words rounded-lg bg-surface-container px-3 py-2 text-sm">
          <span className="font-semibold">Consignes du client : </span>
          {order.instructions}
        </p>
      )}

      <dl className="mt-4 divide-y divide-outline-variant rounded-lg border border-outline-variant text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-3 py-2.5">
            <dt className="flex-shrink-0 text-on-surface-variant">{label}</dt>
            <dd className="break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-on-surface-variant">
        Le nom et le téléphone du destinataire vous sont communiqués une fois la course acceptée.
      </p>

      {hasPending && !offering && (
        <div className="mt-4 rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Votre proposition : <strong>{formatFcfa(offer.amount)}</strong>, en attente de la réponse du client.
          {offer.message && <span className="block text-xs">« {offer.message} »</span>}
          <span className="mt-1 flex gap-4 font-semibold">
            <button type="button" onClick={() => setOffering(true)} className="underline">
              Modifier
            </button>
            <button type="button" onClick={() => onWithdraw(order.id)} className="underline">
              Retirer
            </button>
          </span>
        </div>
      )}

      {offer?.status === 'declined' && !offering && (
        <p className="mt-4 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          Le client a refusé votre proposition de {formatFcfa(offer.amount)}. Vous pouvez accepter son prix ou en proposer un autre.
        </p>
      )}

      {offering && (
        <div className="mt-4">
          <PriceOfferForm
            order={order}
            initialAmount={hasPending ? offer.amount : undefined}
            initialMessage={hasPending ? offer.message : undefined}
            onSubmit={submitOffer}
            onCancel={() => setOffering(false)}
          />
        </div>
      )}
    </Sheet>
  );
}
