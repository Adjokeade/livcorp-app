import Sheet from '../common/Sheet';
import Button from '../common/Button';
import RouteMap from '../client/RouteMap';
import RouteInfo from './RouteInfo';
import { formatDuration, formatFcfa, formatKm, timeAgo } from '../../lib/format';

// Fiche détaillée d'une course libre, côté livreur : photo, carte, adresses exactes avec repères, consignes.
// Le prix est imposé par LIV corp selon la distance : le livreur accepte la course à ce prix, ou la laisse.
export default function AvailableOrderSheet({ open, order, busy, unavailableReason, onClose, onAccept }) {
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

  const rows = [
    ['Distance', order.distance_km != null ? `${formatKm(order.distance_km)}${order.duration_min ? ` · environ ${formatDuration(order.duration_min)}` : ''}` : null],
    ['Urgence', order.urgency === 'express' ? 'Express (prioritaire)' : 'Standard'],
    ['Description', order.package_type],
    ['Publiée', `${timeAgo(order.created_at)}${order.client_first_name ? ` par ${order.client_first_name}` : ''}`],
    ['Paiement', 'À la réception, devant vous'],
  ].filter(([, value]) => value);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${order.type === 'course' ? 'Course' : 'Colis'} #${order.reference}`}
      subtitle={`${formatKm(order.distance_km)} · ${timeAgo(order.created_at)}`}
      footer={
        <Button onClick={() => onAccept(order.id)} disabled={busy} className="w-full">
          {busy ? '…' : `Accepter à ${formatFcfa(order.price)}`}
        </Button>
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
    </Sheet>
  );
}
