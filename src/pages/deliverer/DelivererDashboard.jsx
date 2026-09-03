import { useEffect, useRef, useState } from 'react';
import delivererService from '../../services/delivererService';
import useAuthStore from '../../store/useAuthStore';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import TrustBadge from '../../components/common/TrustBadge';
import Spinner from '../../components/common/Spinner';

const NEXT_STATUS = {
  acceptee: { next: 'colis_recupere', label: "J'ai récupéré le colis" },
  colis_recupere: { next: 'en_cours_livraison', label: 'Je pars en livraison' },
  en_cours_livraison: { next: 'livree', label: "J'ai livré" },
};

export default function DelivererDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('available'); // 'available' | 'mine'
  const [available, setAvailable] = useState(null);
  const [mine, setMine] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const watchIdRef = useRef(null);

  async function refresh() {
    const [a, m] = await Promise.all([delivererService.available(), delivererService.mine()]);
    setAvailable(a.data ?? []);
    setMine(m.data ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Bascule disponible/indisponible avec géolocalisation active — cf. prompt frontend
  // §3 "Livreur > Bascule disponible/indisponible avec géolocalisation active".
  // La position est poussée pour la course "en cours de livraison" la plus récente,
  // conformément à POST /deliverer/orders/{order}/location.
  function toggleOnline() {
    if (isOnline) {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsOnline(false);
      return;
    }

    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const activeOrder = mine?.find((o) => o.status === 'en_cours_livraison' || o.status === 'colis_recupere');
        if (activeOrder) {
          delivererService.pushLocation(activeOrder.id, pos.coords.latitude, pos.coords.longitude).catch(() => {});
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    setIsOnline(true);
  }

  async function handleAccept(orderId) {
    setBusyOrderId(orderId);
    try {
      await delivererService.accept(orderId);
      await refresh();
      setTab('mine');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleAdvanceStatus(order) {
    const step = NEXT_STATUS[order.status];
    if (!step) return;
    setBusyOrderId(order.id);
    try {
      await delivererService.updateStatus(order.id, step.next);
      await refresh();
    } finally {
      setBusyOrderId(null);
    }
  }

  if (!available || !mine) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Bonjour, {user?.first_name} 👋</h1>
          <TrustBadge icon="⭐">{user?.deliverer?.average_rating ?? '—'}/5 · Livreur Pro</TrustBadge>
        </div>
        <Button variant={isOnline ? 'secondary' : 'primary'} onClick={toggleOnline}>
          {isOnline ? '🟢 En ligne — passer indisponible' : '⚪ Passer disponible'}
        </Button>
      </div>

      <div className="mt-6 flex gap-2 border-b border-outline-variant">
        <TabButton active={tab === 'available'} onClick={() => setTab('available')}>
          Courses disponibles ({available.length})
        </TabButton>
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
          Mes courses ({mine.length})
        </TabButton>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {tab === 'available' &&
          (available.length === 0 ? (
            <p className="text-on-surface-variant">Aucune course disponible pour le moment.</p>
          ) : (
            available.map((order) => (
              <Card key={order.id} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">#{order.reference}</p>
                  <p className="text-sm text-on-surface-variant">
                    {order.pickup_address} → {order.dropoff_address}
                  </p>
                  <p className="text-sm text-on-surface-variant">{order.distance_km} km</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold text-primary">{order.deliverer_payout ?? order.price} FCFA</span>
                  <Button onClick={() => handleAccept(order.id)} disabled={busyOrderId === order.id}>
                    {busyOrderId === order.id ? '…' : 'Accepter'}
                  </Button>
                </div>
              </Card>
            ))
          ))}

        {tab === 'mine' &&
          (mine.length === 0 ? (
            <p className="text-on-surface-variant">Aucune course en cours.</p>
          ) : (
            mine.map((order) => (
              <Card key={order.id} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">#{order.reference}</p>
                  <p className="text-sm text-on-surface-variant">
                    {order.pickup_address} → {order.dropoff_address}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={order.status} />
                  {NEXT_STATUS[order.status] && (
                    <Button onClick={() => handleAdvanceStatus(order)} disabled={busyOrderId === order.id}>
                      {busyOrderId === order.id ? '…' : NEXT_STATUS[order.status].label}
                    </Button>
                  )}
                </div>
              </Card>
            ))
          ))}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
        active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
      }`}
    >
      {children}
    </button>
  );
}
