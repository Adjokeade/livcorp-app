import { useEffect, useRef, useState } from 'react';
import delivererService from '../../services/delivererService';
import Card from '../common/Card';
import { formatDuration, formatKm, shortPlace } from '../../lib/format';
import { navigationUrl } from '../../lib/geocoding';

const REFRESH_MS = 20000;
const MOVE_REFRESH_DEG = 0.0007; // ~80 m : au-delà, on recalcule sans attendre

// « Mon itinéraire » : tous les colis que j'ai à récupérer ou à livrer, dans l'ordre conseillé, avec pour chaque arrêt
// la distance et la durée sur route depuis MA position actuelle. Recalculé quand je bouge et toutes les 20 secondes.
export default function RoutePlanPanel({ coords, orderIdsKey, onUpdate }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const lastAsked = useRef(null);
  const busy = useRef(false);

  async function load(force = false) {
    if (busy.current) return;
    const moved = !lastAsked.current || !coords
      || Math.abs(coords.lat - lastAsked.current.lat) > MOVE_REFRESH_DEG
      || Math.abs(coords.lng - lastAsked.current.lng) > MOVE_REFRESH_DEG;
    if (!force && !moved) return;

    busy.current = true;
    try {
      const data = await delivererService.routePlan(coords ?? undefined);
      lastAsked.current = coords ?? { lat: 0, lng: 0 };
      setPlan(data);
      setError('');
      onUpdate?.(data);
    } catch (err) {
      setError(err.response?.status === 422 ? 'Activez la localisation pour calculer votre itinéraire.' : 'Itinéraire indisponible pour le moment.');
    } finally {
      busy.current = false;
    }
  }

  // Nouvelle position : recalcul si je me suis déplacé ; nouvelle course ou course terminée : recalcul immédiat.
  useEffect(() => {
    load(false);
  }, [coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    lastAsked.current = null;
    load(true);
  }, [orderIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => !document.hidden && load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan && !error) return null;
  if (plan && plan.stops.length === 0) return null;

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Mon itinéraire</h2>
        {plan && (
          <p className="text-sm text-on-surface-variant">
            {plan.stops.length} arrêt{plan.stops.length > 1 ? 's' : ''} · <strong className="text-on-surface">{formatKm(plan.total_distance_km)}</strong> · environ{' '}
            <strong className="text-on-surface">{formatDuration(plan.total_duration_min) || '1 min'}</strong>
          </p>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-on-primary-fixed-variant">{error}</p>}

      {plan && (
        <ol className="mt-3 flex flex-col gap-2">
          {plan.stops.map((stop) => (
            <li key={`${stop.order_id}-${stop.type}`} className="flex items-start gap-3 rounded-lg bg-surface-container p-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${stop.type === 'pickup' ? 'bg-primary' : 'bg-secondary'}`}>
                {stop.order}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {stop.type === 'pickup' ? 'Récupérer' : 'Livrer'} · #{stop.reference}
                </p>
                <p className="truncate text-on-surface-variant">{shortPlace(stop.address)}</p>
                <a href={navigationUrl(stop.lat, stop.lng)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-secondary underline">
                  Ouvrir l'itinéraire
                </a>
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="font-bold">{formatKm(stop.distance_km)}</p>
                <p className="text-xs text-on-surface-variant">{stop.eta_min > 0 ? `≈ ${formatDuration(stop.eta_min)}` : 'sur place'}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {plan?.source === 'approx' && (
        <p className="mt-2 text-xs text-on-surface-variant">Distances estimées : le service d'itinéraires ne répond pas pour l'instant.</p>
      )}
    </Card>
  );
}
