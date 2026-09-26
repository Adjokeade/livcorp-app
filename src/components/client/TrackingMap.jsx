import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { DROPOFF_ICON, PICKUP_ICON } from './RouteMap';

function deliverIcon(initial, stale) {
  return L.divIcon({
    className: '',
    html: `<div class="deliverer-dot${stale ? ' is-stale' : ''}"><span>${initial}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function pointsToFit(order, tracking) {
  const pickup = order.pickup_lat ? [Number(order.pickup_lat), Number(order.pickup_lng)] : null;
  const dropoff = order.dropoff_lat ? [Number(order.dropoff_lat), Number(order.dropoff_lng)] : null;
  const courier = tracking?.position ? [tracking.position.lat, tracking.position.lng] : null;
  const target = tracking?.target === 'pickup' ? pickup : tracking?.target === 'dropoff' ? dropoff : null;

  // Le livreur et l'endroit où il va, quand on les connaît ; sinon tout le trajet.
  return courier && target ? [courier, target] : [pickup, dropoff].filter(Boolean);
}

// Recadre sur le livreur et sa destination à l'arrivée de la première position et à chaque changement de cible,
// mais pas à chaque mise à jour : la carte ne doit pas bouger sous le doigt de quelqu'un qui l'explore.
function Fit({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15));
    else map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

function RecenterButton({ points }) {
  const map = useMap();
  if (points.length < 2) return null;
  return (
    <button
      type="button"
      onClick={() => map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 16 })}
      className="absolute bottom-8 right-3 z-[1000] rounded-full bg-surface-container-lowest px-3 py-1.5 text-xs font-bold text-secondary shadow-modal"
    >
      Recentrer
    </button>
  );
}

// Carte de suivi : départ (A), destination (B), livreur en direct avec sa trace récente.
export default function TrackingMap({ order, tracking }) {
  const pickup = order.pickup_lat ? [Number(order.pickup_lat), Number(order.pickup_lng)] : null;
  const dropoff = order.dropoff_lat ? [Number(order.dropoff_lat), Number(order.dropoff_lng)] : null;
  const position = tracking?.position ? [tracking.position.lat, tracking.position.lng] : null;
  const points = pointsToFit(order, tracking);
  const initial = order.deliverer?.user?.first_name?.[0]?.toUpperCase() ?? 'L';

  return (
    <div className="isolate h-[380px] overflow-hidden rounded-lg shadow-card lg:h-[560px]">
      <MapContainer center={pickup ?? [6.3703, 2.3912]} zoom={14} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit points={points} fitKey={`${order.status}|${tracking?.target}|${Boolean(position)}`} />
        {tracking?.trail?.length > 1 && (
          <Polyline positions={tracking.trail} pathOptions={{ color: '#3871c2', weight: 4, opacity: 0.6, dashArray: '2 8' }} />
        )}
        {pickup && <Marker position={pickup} icon={PICKUP_ICON} />}
        {dropoff && <Marker position={dropoff} icon={DROPOFF_ICON} />}
        {position && (
          <Marker position={position} icon={deliverIcon(initial, !tracking.sharing)} zIndexOffset={1000} />
        )}
        <RecenterButton points={points} />
      </MapContainer>
    </div>
  );
}
