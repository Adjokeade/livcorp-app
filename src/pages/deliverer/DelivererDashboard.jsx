import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import delivererService from '../../services/delivererService';
import useAuthStore from '../../store/useAuthStore';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import AvatarUploader from '../../components/common/AvatarUploader';
import TrustBadge from '../../components/common/TrustBadge';
import Spinner from '../../components/common/Spinner';
import PendingValidation from '../../components/deliverer/PendingValidation';
import WalletPanel from '../../components/deliverer/WalletPanel';
import ReviewsPanel from '../../components/deliverer/ReviewsPanel';
import DeliveryRequestCard, { fromDelivererOrder } from '../../components/announcements/DeliveryRequestCard';
import AvailableOrderSheet from '../../components/deliverer/AvailableOrderSheet';
import useDetailParam from '../../hooks/useDetailParam';
import useLiveLocation from '../../hooks/useLiveLocation';
import LiveLocationBanner from '../../components/deliverer/LiveLocationBanner';
import MyOrderCard from '../../components/deliverer/MyOrderCard';
import RoutePlanPanel from '../../components/deliverer/RoutePlanPanel';
import { shortPlace } from '../../lib/format';

const NEXT_STATUS = {
  acceptee: { next: 'colis_recupere', label: "J'ai récupéré le colis" },
  colis_recupere: { next: 'en_cours_livraison', label: 'Je pars en livraison' },
  // La remise ("livree") passe par le code du destinataire : cf. MyOrderCard > DeliverSheet.
};

export default function DelivererDashboard() {
  const { user, refreshUser } = useAuthStore();
  const approved = user?.deliverer?.verification_status === 'approved';
  // Sans photo de profil, le serveur refuse l'accès aux courses : on la demande avant tout appel.
  const needsAvatar = approved && !user?.avatar_url;
  const detail = useDetailParam();
  // Une notification de message ouvre "?chat=<id de la course>" : on va sur "Mes courses" et on ouvre la discussion.
  const [searchParams, setSearchParams] = useSearchParams();
  const [chatOrderId, setChatOrderId] = useState(() => searchParams.get('chat'));
  const [tab, setTab] = useState(chatOrderId || searchParams.get('onglet') === 'mine' ? 'mine' : 'available'); // 'available' | 'mine' | 'wallet' | 'reviews'
  const [available, setAvailable] = useState(null);
  const [mine, setMine] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [plan, setPlan] = useState(null); // itinéraire : arrêts, distance et durée depuis ma position
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  // Position partagée avec le client tant qu'une course est en cours (départ puis destination), qu'on soit
  // "disponible" ou non : le client suit son colis, c'est la raison d'être de ce partage.
  const activeCourseIds = approved
    ? (mine ?? []).filter((o) => ['acceptee', 'colis_recupere', 'en_cours_livraison'].includes(o.status)).map((o) => o.id)
    : [];
  const liveLocation = useLiveLocation(activeCourseIds);

  async function refresh() {
    try {
      const [a, m] = await Promise.all([delivererService.available(), delivererService.mine()]);
      setAvailable(a.data ?? []);
      setMine(m.data ?? []);
      setLoadError('');

    } catch (err) {
      setAvailable((prev) => prev ?? []);
      setMine((prev) => prev ?? []);
      setLoadError(err.response?.data?.message ?? 'Impossible de charger vos courses. Réessayez.');
    }
  }

  // Le statut de validation a pu changer depuis la dernière connexion (approbation admin).
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (approved && !needsAvatar) refresh();
  }, [approved, needsAvatar]);

  useEffect(() => {
    if (searchParams.has('chat')) {
      const next = new URLSearchParams(searchParams);
      next.delete('chat');
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function markMessagesRead(orderId) {
    setMine((prev) => prev?.map((o) => (o.id === orderId && o.unread_messages_count > 0 ? { ...o, unread_messages_count: 0 } : o)) ?? prev);
  }

  // Nouvelles courses : relecture discrète toutes les
  // 8 s, seulement quand l'onglet est visible.
  useEffect(() => {
    if (!approved || needsAvatar) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 8000);
    return () => clearInterval(timer);
  }, [approved, needsAvatar]);

  // Tant qu'une livraison attend le paiement du client, on relit les courses toutes les 3 s :
  // le livreur voit le statut du paiement dès que le client le valide, sans rien recharger.
  const awaitingPayment = Boolean(
    mine?.some((o) => o.status === 'en_cours_livraison' && o.payment_status !== 'paye'),
  );
  useEffect(() => {
    if (!approved || !awaitingPayment) return undefined;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [approved, awaitingPayment]);

  // Bascule disponible/indisponible avec géolocalisation active — cf. cahier
  // des charges "Parcours du livreur", étape 4. La bascule est persistée côté
  // serveur (PATCH /deliverer/availability) : c'est elle qui rend le livreur
  // visible ou non sur la carte des expéditeurs. La position est en plus
  // poussée en continu pour la course en cours de livraison, conformément à
  // POST /deliverer/orders/{order}/location.
  async function toggleOnline() {
    setOnlineError('');

    if (isOnline) {
      setTogglingOnline(true);
      try {
        await delivererService.setAvailability(false);
        setIsOnline(false);
      } catch {
        setOnlineError('Impossible de vous passer indisponible. Réessayez.');
      } finally {
        setTogglingOnline(false);
      }
      return;
    }

    if (!navigator.geolocation) {
      setOnlineError('La géolocalisation n\'est pas disponible sur cet appareil.');
      return;
    }

    setTogglingOnline(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          await delivererService.setAvailability(true, coords);
          setIsOnline(true);

        } catch {
          setOnlineError('Impossible de vous passer disponible. Réessayez.');
        } finally {
          setTogglingOnline(false);
        }
      },
      () => {
        setOnlineError('Autorisez la géolocalisation pour passer disponible.');
        setTogglingOnline(false);
      },
      { enableHighAccuracy: true },
    );
  }

  async function handleAccept(orderId) {
    setBusyOrderId(orderId);
    setActionError('');
    try {
      await delivererService.accept(orderId);
      await refresh();
      setTab('mine');
      return true;
    } catch (err) {
      setActionError(err.response?.data?.message ?? "Impossible d'accepter cette course. Elle a peut-être été prise.");
      await refresh();
      return false;
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleAdvanceStatus(order) {
    const step = NEXT_STATUS[order.status];
    if (!step) return;
    setBusyOrderId(order.id);
    setActionError('');
    try {
      await delivererService.updateStatus(order.id, step.next);
      await refresh();
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Action impossible. Réessayez.');
      await refresh();
    } finally {
      setBusyOrderId(null);
    }
  }

  // Le profil livreur (statut, pièces) arrive avec /auth/me : avant cela, on ne sait pas encore si le compte est
  // validé, et afficher "Complétez votre dossier" à un livreur validé serait faux.
  if (user && !('deliverer' in user && 'documents' in user)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!approved) {
    return <PendingValidation user={user} onRefresh={refreshUser} />;
  }

  if (needsAvatar) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-2xl font-bold">Bonjour, {user?.first_name}</h1>
        <Card className="mt-6">
          <h2 className="font-display text-lg font-bold">Ajoutez votre photo de profil</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Votre compte est validé. Dernière étape avant d'accepter des courses : vos clients doivent pouvoir vous reconnaître.
          </p>
          <div className="mt-5">
            <AvatarUploader user={user} required />
          </div>
        </Card>
      </div>
    );
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Bonjour, {user?.first_name} 👋</h1>
          <TrustBadge icon="⭐">
            {Number(user?.deliverer?.average_rating) > 0
              ? `${Number(user.deliverer.average_rating).toFixed(1)}/5`
              : 'Pas encore d\'avis'}
          </TrustBadge>
        </div>
        <div className="sm:text-right">
          <Button
            variant={isOnline ? 'secondary' : 'primary'}
            onClick={toggleOnline}
            disabled={togglingOnline}
            className="w-full sm:w-auto"
          >
            {togglingOnline ? '…' : isOnline ? '🟢 En ligne, passer indisponible' : '⚪ Passer disponible'}
          </Button>
          {onlineError && <p className="mt-1 text-xs text-error">{onlineError}</p>}
        </div>
      </div>

      <LiveLocationBanner state={liveLocation} courseCount={activeCourseIds.length} />

      {actionError && (
        <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {actionError}
        </p>
      )}

      {loadError && (
        <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {loadError}
        </p>
      )}

      <div className="-mx-4 mt-6 flex gap-x-5 overflow-x-auto border-b border-outline-variant px-4 sm:mx-0 sm:px-0">
        <TabButton active={tab === 'available'} onClick={() => setTab('available')}>
          Courses disponibles ({available.length})
        </TabButton>
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
          Mes courses ({mine.length})
        </TabButton>
        <TabButton active={tab === 'wallet'} onClick={() => setTab('wallet')}>
          Portefeuille
        </TabButton>
        <TabButton active={tab === 'reviews'} onClick={() => setTab('reviews')}>
          Avis
        </TabButton>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {tab === 'wallet' && <WalletPanel />}
        {tab === 'reviews' && <ReviewsPanel />}
        {tab === 'available' &&
          (available.length === 0 ? (
            <p className="text-on-surface-variant">Aucune course disponible pour le moment.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((order) => (
                <DeliveryRequestCard key={order.id} request={fromDelivererOrder(order, shortPlace)} onOpen={() => detail.open(order.id)} />
              ))}
            </div>
          ))}

        {tab === 'mine' && activeCourseIds.length > 0 && (
          <RoutePlanPanel coords={liveLocation.coords} orderIdsKey={activeCourseIds.join(',')} onUpdate={setPlan} />
        )}

        {tab === 'mine' &&
          (mine.length === 0 ? (
            <p className="text-on-surface-variant">Aucune course en cours.</p>
          ) : (
            mine.map((order) => (
              <MyOrderCard
                key={order.id}
                order={order}
                nextStop={plan?.stops.find((s) => s.order_id === order.id) ?? null}
                busy={busyOrderId === order.id}
                onAdvance={handleAdvanceStatus}
                onChanged={refresh}
                onMessagesRead={markMessagesRead}
                autoOpenChat={chatOrderId === String(order.id)}
                onChatShown={() => setChatOrderId(null)}
              />
            ))
          ))}
      </div>

      <AvailableOrderSheet
        open={Boolean(detail.openId)}
        order={available.find((o) => String(o.id) === detail.openId) ?? null}
        unavailableReason={mine.some((o) => String(o.id) === detail.openId) ? 'mine' : 'gone'}
        busy={busyOrderId !== null && String(busyOrderId) === detail.openId}
        onClose={detail.close}
        onAccept={async (orderId) => {
          if (await handleAccept(orderId)) detail.close();
        }}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold transition ${
        active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
      }`}
    >
      {children}
    </button>
  );
}
