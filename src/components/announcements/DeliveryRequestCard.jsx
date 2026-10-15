import { formatDuration, formatFcfa, formatKm, timeAgo } from '../../lib/format';

const NEW_MINUTES = 15;

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICON_ROUTE = 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 17h6a3 3 0 000-6H11a3 3 0 010-6h6';
const ICON_CLOCK = 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const ICON_TIME = 'M12 6v6l4 2M12 3a9 9 0 100 18 9 9 0 000-18z';
const ICON_BOX = 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8';
const ICON_BAG = 'M6 7h12l1 13H5L6 7zM9 7a3 3 0 016 0';

function Pill({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
      <Icon d={icon} />
      {children}
    </span>
  );
}

// Carte d'une demande de livraison : photo, trajet en deux étapes, distance et durée, prix.
// `request` est le modèle commun aux pages Annonces et Tableau de bord du livreur :
// { id, reference, type, urgency, price, from, to, distance_km, duration_min, description, photo_url, photo_note,
//   created_at, earnings }
export default function DeliveryRequestCard({ request, onOpen }) {
  const r = request;
  const isNew = Date.now() - new Date(r.created_at).getTime() < NEW_MINUTES * 60000;
  const isCourse = r.type === 'course';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${isCourse ? 'Course' : 'Colis'} de ${r.from} vers ${r.to}, ${formatFcfa(r.price)}`}
      className="group card card-hover flex h-full w-full flex-col overflow-hidden !p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      <div className={`relative w-full overflow-hidden bg-surface-container ${r.photo_url ? 'aspect-[16/9]' : 'h-28'}`}>
        {r.photo_url ? (
          <img src={r.photo_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-fixed via-surface-container to-secondary-fixed px-6 text-center text-on-surface-variant">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 opacity-70" aria-hidden="true">
              <path d={isCourse ? ICON_BAG : ICON_BOX} />
            </svg>
            <span className="text-xs font-semibold">{r.photo_note}</span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface-container-lowest/95 px-2.5 py-1 text-xs font-bold text-on-surface shadow-sm">
            {isCourse ? 'Course' : 'Colis'}
          </span>
          {r.urgency === 'express' && (
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-on-primary shadow-sm">Express</span>
          )}
          {isNew && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-on-secondary shadow-sm">Nouveau</span>
          )}
        </div>

      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Trajet : départ puis destination, reliés par un tracé en pointillés. */}
        <div className="flex gap-3">
          <div className="flex flex-col items-center py-1" aria-hidden="true">
            <span className="h-3 w-3 rounded-full border-[3px] border-primary bg-surface-container-lowest" />
            <span className="my-1 w-0 flex-1 border-l-2 border-dashed border-outline-variant" />
            <span className="h-3 w-3 rounded-sm bg-secondary" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Départ</p>
              <p className="truncate font-display text-[15px] font-bold leading-tight">{r.from}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Destination</p>
              <p className="truncate font-display text-[15px] font-bold leading-tight">{r.to}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.distance_km != null && <Pill icon={ICON_ROUTE}>{formatKm(r.distance_km)}</Pill>}
          {r.duration_min ? <Pill icon={ICON_CLOCK}>{formatDuration(r.duration_min)}</Pill> : null}
          <Pill icon={ICON_TIME}>{timeAgo(r.created_at)}</Pill>
        </div>

        {r.description && <p className="mt-3 line-clamp-2 break-words text-sm text-on-surface-variant">{r.description}</p>}

        <div className="min-h-4 flex-1" />
        <div className="flex items-end justify-between gap-3 border-t border-outline-variant pt-3.5">
          <div>
            <p className="font-display text-2xl font-extrabold leading-none text-primary">{formatFcfa(r.price)}</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {r.earnings != null ? `gain estimé ${formatFcfa(r.earnings)}` : 'prix fixé par LIV corp'}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-lg font-bold text-primary transition group-hover:bg-primary group-hover:text-on-primary" aria-hidden="true">
            ›
          </span>
        </div>
      </div>
    </button>
  );
}

// Conversions vers le modèle commun de DeliveryRequestCard.
export function fromPublicOrder(order) {
  return {
    id: order.id,
    reference: order.reference,
    type: order.type,
    urgency: order.urgency,
    price: order.price,
    from: order.pickup_area,
    to: order.dropoff_area,
    distance_km: order.distance_km,
    duration_min: order.duration_min,
    description: order.package_type,
    photo_url: order.photo_url,
    photo_note: order.type === 'course' ? 'Course à effectuer' : 'Sans photo',
    created_at: order.created_at,
  };
}

export function fromDelivererOrder(order, shortPlace) {
  return {
    id: order.id,
    reference: order.reference,
    type: order.type,
    urgency: order.urgency,
    price: order.price,
    from: shortPlace(order.pickup_address),
    to: shortPlace(order.dropoff_address),
    distance_km: order.distance_km,
    duration_min: order.duration_min,
    description: order.package_type,
    photo_url: order.photo_url,
    photo_note: order.type === 'course' ? 'Course à effectuer' : 'Sans photo',
    created_at: order.created_at,
    earnings: order.estimated_earnings,
  };
}
