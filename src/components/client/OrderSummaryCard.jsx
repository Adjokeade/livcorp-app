import { formatFcfa, formatKm } from '../../lib/format';
import Card from '../common/Card';
import PhotoViewer from '../common/PhotoViewer';

// Rappel de la commande sur la page de suivi : la photo du colis en grand (toucher pour agrandir), le prix
// convenu, le trajet et les repères.
export default function OrderSummaryCard({ order }) {
  return (
    <Card className="overflow-hidden !p-0">
      {order.photo_url && <PhotoViewer src={order.photo_url} className="h-52 rounded-none sm:h-64" />}

      <div className="p-4">
        <h2 className="text-sm font-semibold text-on-surface-variant">VOTRE COMMANDE</h2>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-display text-2xl font-extrabold text-primary">{formatFcfa(order.price)}</p>
          {order.distance_km && (
            <p className="text-right text-xs text-on-surface-variant">
              {formatKm(order.distance_km)}
              {order.duration_min ? ` · environ ${order.duration_min} min` : ''}
            </p>
          )}
        </div>
        {order.package_type && <p className="mt-2 break-words text-sm">{order.package_type}</p>}

        <dl className="mt-3 space-y-2 border-t border-outline-variant pt-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-on-surface-variant">Départ (A)</dt>
            <dd className="break-words">
              {order.pickup_address}
              {order.pickup_details && <span className="block text-xs text-on-surface-variant">{order.pickup_details}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-on-surface-variant">Destination (B)</dt>
            <dd className="break-words">
              {order.dropoff_address}
              {order.dropoff_details && <span className="block text-xs text-on-surface-variant">{order.dropoff_details}</span>}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
