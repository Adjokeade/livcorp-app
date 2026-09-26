import { navigationUrl } from '../../lib/geocoding';

// Départ (A) et destination (B) d'une course, avec les repères laissés par le client et un lien
// qui ouvre l'application de cartes du téléphone pour s'y rendre.
export default function RouteInfo({ order, highlight }) {
  const points = [
    { key: 'pickup', letter: 'A', color: 'bg-primary', address: order.pickup_address, details: order.pickup_details, lat: order.pickup_lat, lng: order.pickup_lng },
    { key: 'dropoff', letter: 'B', color: 'bg-secondary', address: order.dropoff_address, details: order.dropoff_details, lat: order.dropoff_lat, lng: order.dropoff_lng },
  ];

  return (
    <ul className="flex flex-col gap-2">
      {points.map((point) => (
        <li key={point.key} className={`flex items-start gap-2 ${highlight && highlight !== point.key ? 'opacity-60' : ''}`}>
          <span
            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${point.color}`}
          >
            {point.letter}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words">{point.address}</p>
            {point.details && <p className="break-words text-xs text-on-surface-variant">{point.details}</p>}
            {point.lat && (
              <a
                href={navigationUrl(point.lat, point.lng)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-secondary underline"
              >
                Ouvrir l'itinéraire
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
