import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import clientOrderService from '../../services/clientOrderService';
import { subscribeToOrder } from '../../lib/echo';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import TrustBadge from '../../components/common/TrustBadge';
import Spinner from '../../components/common/Spinner';

// Corrige les icônes par défaut de Leaflet (chemins cassés avec les bundlers Vite).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Microcopie chaleureuse par statut — cf. prompt frontend §5 "Expérience hyper humaine" :
// "Amina a récupéré votre colis, elle arrive dans 12 min" plutôt que "Statut : en transit".
function humanMessage(order) {
  const name = order?.deliverer?.user?.first_name;
  switch (order?.status) {
    case 'creee':
      return 'Nous cherchons un livreur disponible près de chez vous…';
    case 'acceptee':
      return `${name ?? 'Votre livreur'} a accepté votre course et se dirige vers le point de collecte.`;
    case 'colis_recupere':
      return `${name ?? 'Votre livreur'} a récupéré votre colis, il arrive !`;
    case 'en_cours_livraison':
      return `${name ?? 'Votre livreur'} est en route vers vous. Préparez-vous à la réception.`;
    case 'livree':
      return 'Livraison effectuée. Merci d\'avoir fait confiance à LIV corp !';
    case 'litige':
      return 'Un souci est survenu sur cette commande — notre équipe vous accompagne.';
    default:
      return 'Suivi de votre commande…';
  }
}

const STEPS = [
  { key: 'creee', label: 'Commande confirmée' },
  { key: 'acceptee', label: 'Prise en charge' },
  { key: 'en_cours_livraison', label: 'En route vers vous' },
  { key: 'livree', label: 'Livraison effectuée' },
];

export default function OrderTracking() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [position, setPosition] = useState(null); // [lat, lng]
  const [trail, setTrail] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await clientOrderService.show(orderId);
        if (cancelled) return;
        setOrder(data);

        try {
          const point = await clientOrderService.track(orderId);
          if (point?.lat) setPosition([Number(point.lat), Number(point.lng)]);
        } catch {
          // pas encore de position GPS disponible — normal en tout début de course
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // Abonnement au canal privé "order.{id}" — cf. app/Events/PrivateOrderChannel.php
    const unsubscribe = subscribeToOrder(orderId, {
      onLocationUpdated: (payload) => {
        const next = [Number(payload.lat), Number(payload.lng)];
        setPosition(next);
        setTrail((prev) => [...prev, next]);
      },
      onStatusChanged: (payload) => {
        setOrder((prev) => (prev ? { ...prev, status: payload.status } : prev));
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!order) {
    return <p className="text-on-surface-variant">Commande introuvable.</p>;
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="h-[420px] overflow-hidden rounded-lg shadow-card lg:h-[560px]">
        <MapContainer
          center={position ?? [6.3703, 2.3912] /* Cotonou par défaut */}
          zoom={14}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {position && <Marker position={position} />}
          {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#904d00' }} />}
        </MapContainer>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <span className="text-xs text-on-surface-variant">#{order.reference}</span>
          </div>
          <p className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            {humanMessage(order)}
          </p>
        </Card>

        {order.deliverer && (
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-fixed font-display text-lg font-bold text-on-secondary-fixed">
                {order.deliverer.user?.first_name?.[0] ?? '?'}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{order.deliverer.user?.first_name}</p>
                <TrustBadge icon="⭐">
                  {order.deliverer.average_rating ?? '—'}/5 · {order.deliverer.total_deliveries ?? 0} livraisons
                </TrustBadge>
              </div>
              <div className="flex gap-2">
                <a
                  href={`tel:${order.deliverer.user?.phone ?? ''}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-fixed text-primary"
                  aria-label="Appeler le livreur"
                >
                  📞
                </a>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-sm font-semibold text-on-surface-variant">SUIVI DE COMMANDE</h2>
          <ol className="mt-3 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    i <= currentStepIndex
                      ? 'bg-secondary text-on-secondary'
                      : 'bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {i <= currentStepIndex ? '✓' : ''}
                </span>
                <span className={i <= currentStepIndex ? 'font-medium' : 'text-on-surface-variant'}>{s.label}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
