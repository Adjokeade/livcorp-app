import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import marketplaceService from '../services/marketplaceService';
import useAuthStore from '../store/useAuthStore';
import useDetailParam from '../hooks/useDetailParam';
import AnnouncementCard from '../components/announcements/AnnouncementCard';
import PublicAnnouncementSheet from '../components/announcements/PublicAnnouncementSheet';
import Card from '../components/common/Card';
import TrustBadge from '../components/common/TrustBadge';
import Spinner from '../components/common/Spinner';
import { formatDuration, formatKm, timeAgo } from '../lib/format';

// Corrige les icônes par défaut de Leaflet (chemins cassés avec les bundlers Vite).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const COTONOU = [6.3703, 2.3912];

// Le pouls de la plateforme, en direct : colis en attente d'un livreur, et
// livreurs actuellement disponibles avec leur position. Ouvert à tout
// utilisateur connecté, pas seulement aux clients.
export default function Marketplace() {
  const [position, setPosition] = useState(null);
  const [orders, setOrders] = useState(null);
  const [deliverers, setDeliverers] = useState(null);
  const [error, setError] = useState('');
  const viewer = useAuthStore((s) => s.user);
  const detail = useDetailParam();
  const selected = orders?.find((o) => String(o.id) === detail.openId) ?? null;

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: true },
    );
  }, []);

  // Les annonces se relisent toutes les 20 s (onglet visible) : une annonce prise disparaît, une nouvelle apparaît.
  useEffect(() => {
    const load = () =>
      marketplaceService
        .orders()
        .then((data) => setOrders(data.data ?? []))
        .catch(() => setOrders((prev) => prev ?? []));
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 20000);
    return () => clearInterval(timer);
  }, [viewer?.id]);

  useEffect(() => {
    let cancelled = false;

    marketplaceService
      .deliverers(position)
      .then((data) => {
        if (!cancelled) setDeliverers(data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger les livreurs disponibles pour le moment.');
      });

    return () => {
      cancelled = true;
    };
  }, [position]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Annonces</h1>
      <p className="mt-1 text-sm text-on-surface-variant">
        L'activité de LIV corp en direct : colis en attente et livreurs disponibles.
      </p>

      {error && <p className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Colis disponibles</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!orders ? (
            <div className="col-span-full flex min-h-[15vh] items-center justify-center">
              <Spinner className="h-8 w-8" />
            </div>
          ) : orders.length === 0 ? (
            <p className="col-span-full text-on-surface-variant">Aucun colis en attente pour le moment.</p>
          ) : (
            orders.map((order) => (
              <AnnouncementCard
                key={order.id}
                title={`${order.pickup_area} → ${order.dropoff_area}`}
                meta={[order.distance_km != null && formatKm(order.distance_km), order.duration_min && formatDuration(order.duration_min), timeAgo(order.created_at)]
                  .filter(Boolean)
                  .join(' · ')}
                description={order.package_type}
                photoUrl={order.photo_url}
                photoNote={order.has_photo ? 'Photo réservée aux livreurs connectés' : order.type === 'course' ? 'Course à effectuer' : 'Sans photo'}
                chips={[
                  { label: order.type === 'course' ? 'Course' : 'Colis' },
                  ...(order.urgency === 'express' ? [{ label: 'Express', tone: 'primary' }] : []),
                ]}
                corner={
                  order.offers_count > 0 && (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-on-secondary shadow-sm">
                      {order.offers_count} proposition{order.offers_count > 1 ? 's' : ''}
                    </span>
                  )
                }
                price={order.price}
                onOpen={() => detail.open(order.id)}
              />
            ))
          )}
        </div>
      </section>

      <PublicAnnouncementSheet
        open={Boolean(detail.openId) && orders !== null}
        order={selected}
        viewer={viewer}
        onClose={detail.close}
      />

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold">Livreurs disponibles</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="isolate h-[360px] overflow-hidden rounded-lg shadow-card lg:h-[480px]">
            <MapContainer center={position ?? COTONOU} zoom={13} scrollWheelZoom={false} className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {deliverers?.map(
                (d) => d.lat && d.lng && <Marker key={d.id} position={[Number(d.lat), Number(d.lng)]} />,
              )}
            </MapContainer>
          </div>

          <div className="flex flex-col gap-3">
            {!deliverers ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : deliverers.length === 0 ? (
              <p className="text-on-surface-variant">Aucun livreur disponible pour le moment.</p>
            ) : (
              deliverers.map((d) => (
                <Card key={d.id} className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-secondary-fixed font-display text-lg font-bold text-on-secondary-fixed">
                    {d.first_name?.[0] ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold">{d.first_name}</p>
                    <TrustBadge icon="⭐">
                      {d.average_rating ?? '-'}/5 · {d.total_deliveries ?? 0} livraisons
                    </TrustBadge>
                    <p className="mt-1 text-xs capitalize text-on-surface-variant">
                      {d.vehicle_type}
                      {d.distance_km != null && ` · ${d.distance_km} km`}
                    </p>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
