import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { BENIN_BOUNDS, COTONOU } from '../../lib/geocoding';

// Repères A (départ) et B (destination) aux couleurs de la marque. Des divIcon plutôt que les
// images par défaut de Leaflet, que les bundlers cassent (chemins) et qui viennent d'un CDN.
function pinIcon(letter, className) {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin ${className}"><span>${letter}</span></div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });
}
export const PICKUP_ICON = pinIcon('A', 'map-pin-pickup');
export const DROPOFF_ICON = pinIcon('B', 'map-pin-dropoff');

export function FitToContent({ pickup, dropoff, route }) {
  const map = useMap();
  const hasPickup = Boolean(pickup);
  const hasDropoff = Boolean(dropoff);

  // Recadrage à l'arrivée d'un point ou d'un tracé, mais pas à chaque déplacement d'un repère :
  // la carte sauterait sous le doigt pendant le glissé.
  useEffect(() => {
    const points = route?.length > 1 ? route : [pickup, dropoff].filter(Boolean).map((p) => [p.lat, p.lng]);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 15));
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPickup, hasDropoff, route, map]);

  return null;
}

// Un toucher sur la carte place le premier point manquant : recours quand l'adresse n'existe pas
// dans OpenStreetMap, ce qui est fréquent pour les rues et repères informels.
function ClickToPlace({ pickup, dropoff, onMove }) {
  useMapEvents({
    click(e) {
      if (!pickup) onMove('pickup', { lat: e.latlng.lat, lng: e.latlng.lng });
      else if (!dropoff) onMove('dropoff', { lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function RouteMap({ pickup, dropoff, route, onMove, readOnly = false, className = 'h-72 sm:h-96' }) {
  const hint = !pickup
    ? 'Touchez la carte pour placer le point de départ (A)'
    : !dropoff
      ? 'Touchez la carte pour placer la destination (B)'
      : 'Glissez A ou B pour ajuster l\'emplacement exact';

  return (
    <div>
      <div className={`isolate overflow-hidden rounded-lg border border-outline-variant ${className}`}>
        <MapContainer
          center={[COTONOU.lat, COTONOU.lng]}
          zoom={12}
          scrollWheelZoom={false}
          maxBounds={[
            [BENIN_BOUNDS.minLat - 0.5, BENIN_BOUNDS.minLng - 0.5],
            [BENIN_BOUNDS.maxLat + 0.5, BENIN_BOUNDS.maxLng + 0.5],
          ]}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {route?.length > 1 && <Polyline positions={route} pathOptions={{ color: '#3871c2', weight: 5, opacity: 0.85 }} />}
          {pickup && (
            <Marker
              position={[pickup.lat, pickup.lng]}
              icon={PICKUP_ICON}
              draggable={!readOnly}
              eventHandlers={{
                dragend: (e) => onMove?.('pickup', { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }),
              }}
            />
          )}
          {dropoff && (
            <Marker
              position={[dropoff.lat, dropoff.lng]}
              icon={DROPOFF_ICON}
              draggable={!readOnly}
              eventHandlers={{
                dragend: (e) => onMove?.('dropoff', { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }),
              }}
            />
          )}
          <FitToContent pickup={pickup} dropoff={dropoff} route={route} />
          {!readOnly && <ClickToPlace pickup={pickup} dropoff={dropoff} onMove={onMove} />}
        </MapContainer>
      </div>
      {!readOnly && <p className="mt-1.5 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}
