import { useEffect, useState } from 'react';
import { formatAge, formatKm, formatTime } from '../../lib/format';
import Card from '../common/Card';

// Bandeau "où est mon colis" : où va le livreur, dans combien de temps il arrive, et si sa position est récente.
export default function LiveTrackingCard({ order, tracking }) {
  const [now, setNow] = useState(Date.now());
  const name = order.deliverer?.user?.first_name ?? 'Votre livreur';
  const phone = order.deliverer?.user?.phone;

  // Rafraîchit "il y a N s" chaque seconde sans redemander de données.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toPickup = order.status === 'acceptee';
  const position = tracking?.position;
  const age = position ? position.age_seconds + (now - tracking.receivedAt) / 1000 : null;
  const live = Boolean(position) && age < 90;
  const eta = tracking?.eta_min;

  // Arrivée signalée par le livreur : plus fiable que l'estimation, et l'attente devient visible pour tous.
  const arrivedAt = toPickup ? order.pickup_arrived_at : order.dropoff_arrived_at;
  const waitedMin = arrivedAt ? Math.max(0, Math.floor((now - new Date(arrivedAt).getTime()) / 60000)) : null;

  let headline;
  if (arrivedAt) {
    headline = toPickup ? `${name} est arrivé chez l'expéditeur` : `${name} est arrivé chez vous`;
  } else if (!position) {
    headline = `${name} n'a pas encore partagé sa position`;
  } else if (eta === 0) {
    headline = toPickup ? `${name} est arrivé chez l'expéditeur` : `${name} est arrivé`;
  } else if (eta != null) {
    headline = toPickup ? `${name} arrive chez l'expéditeur dans ${eta} min` : `${name} arrive dans ${eta} min`;
  } else {
    headline = toPickup ? `${name} se dirige vers le point de collecte` : `${name} est en route`;
  }

  const arrival = !arrivedAt && eta != null && eta > 0 ? formatTime(new Date(now + eta * 60000)) : null;

  return (
    <Card className={live ? 'border-l-4 border-secondary' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-snug">{headline}</p>
          {arrival && (
            <p className="mt-0.5 text-sm text-on-surface-variant">
              Arrivée vers <strong className="text-on-surface">{arrival}</strong>
              {tracking.distance_km != null && ` · ${formatKm(tracking.distance_km)}`}
              {tracking.distance_source === 'approx' && ' (estimation)'}
            </p>
          )}
          {arrivedAt && (
            <p className="mt-0.5 text-sm text-on-surface-variant">
              {toPickup
                ? `Il récupère le colis${waitedMin > 0 ? ` (sur place depuis ${waitedMin} min)` : ''}.`
                : `Sur place depuis ${waitedMin > 0 ? `${waitedMin} min` : 'un instant'}. Donnez-lui votre code de remise.`}
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${live ? 'bg-secondary' : position ? 'bg-primary' : 'bg-outline-variant'}`}
            />
            {!position ? (
              <span className="text-on-surface-variant">Sa position apparaîtra ici dès qu'il sera en route.</span>
            ) : live ? (
              <span className="text-on-surface-variant">Position mise à jour {formatAge(age)}</span>
            ) : (
              <span className="font-semibold text-primary">
                Position non reçue depuis {formatAge(age).replace('il y a ', '')} : {name} a peut-être perdu le réseau.
              </span>
            )}
          </p>
        </div>
        {phone && (
          <a href={`tel:${phone}`} className="btn-secondary flex-shrink-0 !px-3 !py-2 text-sm" aria-label={`Appeler ${name}`}>
            Appeler
          </a>
        )}
      </div>
    </Card>
  );
}
