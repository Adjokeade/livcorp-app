import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import delivererService from '../../services/delivererService';
import useAuthStore from '../../store/useAuthStore';
import Button from '../../components/common/Button';
import TrustBadge from '../../components/common/TrustBadge';
import Spinner from '../../components/common/Spinner';
import PendingValidation from '../../components/deliverer/PendingValidation';
import WalletPanel from '../../components/deliverer/WalletPanel';
import ReviewsPanel from '../../components/deliverer/ReviewsPanel';
import AnnouncementCard from '../../components/announcements/AnnouncementCard';
import AvailableOrderSheet from '../../components/deliverer/AvailableOrderSheet';
import useDetailParam from '../../hooks/useDetailParam';
import useLiveLocation from '../../hooks/useLiveLocation';
import LiveLocationBanner from '../../components/deliverer/LiveLocationBanner';
import MyOrderCard from '../../components/deliverer/MyOrderCard';
import { formatDuration, formatFcfa, formatKm, shortPlace, timeAgo } from '../../lib/format';

const NEXT_STATUS = {
  acceptee: { next: 'colis_recupere', label: "J'ai récupéré le colis" },
  colis_recupere: { next: 'en_cours_livraison', label: 'Je pars en livraison' },
  // La remise ("livree") passe par le code du destinataire : cf. MyOrderCard > DeliverSheet.
};

export default function DelivererDashboard() {
  const { user, refreshUser } = useAuthStore();
  const approved = user?.deliverer?.verification_status === 'approved';
  const detail = useDetailParam();
  // Une notification de message ouvre "?chat=<id de la course>" : on va sur "Mes courses" et on ouvre la discussion.
  const [searchParams, setSearchParams] = useSearchParams();
  const [chatOrderId, setChatOrderId] = useState(() => searchParams.get('chat'));
  const [tab, setTab] = useState(chatOrderId ? 'mine' : 'available'); // 'available' | 'mine' | 'wallet' | 'reviews'
  const [available, setAvailable] = useState(null);
  const [mine, setMine] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState(null); // { text }
  const knownMineIds = useRef(null); // null tant que la première lecture n'est pas faite
  const acceptedByMe = useRef(new Set());

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

      // Une course qui apparaît dans "Mes courses" sans que le livreur l'ait acceptée directement :
      // le client vient d'accepter sa proposition de prix. On le prévient, quel que soit l'onglet ouvert.
      const ids = new Set((m.data ?? []).map((o) => o.id));
      if (knownMineIds.current) {
        const accepted = (m.data ?? []).find((o) => !knownMineIds.current.has(o.id) && !acceptedByMe.current.has(o.id));
        if (accepted) setNotice({ text: `Le client a accepté votre proposition pour la course #${accepted.reference}.` });
      }
      knownMineIds.current = ids;
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
    if (approved) refresh();
  }, [approved]);

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

  // Nouvelles courses et réponses du client aux propositions de prix : relecture discrète toutes les
  // 8 s, seulement quand l'onglet est visible.
  useEffect(() => {
    if (!approved) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 8000);
    return () => clearInterval(timer);
  }, [approved]);

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

  async function handleOffer(orderId, amount, message) {
    await delivererService.offer(orderId, amount, message);
    await refresh();
  }

  async function handleWithdrawOffer(orderId) {
    setActionError('');
    try {
      await delivererService.withdrawOffer(orderId);
      await refresh();
    } catch (err) {
      setActionError(err.response?.data?.message ?? 'Impossible de retirer la proposition.');
    }
  }

  async function handleAccept(orderId) {
    setBusyOrderId(orderId);
    setActionError('');
    acceptedByMe.current.add(orderId);
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

      {notice && (
        <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
          <p>{notice.text}</p>
          <span className="flex flex-shrink-0 gap-3 font-semibold">
            <button
              type="button"
              className="underline"
              onClick={() => {
                setTab('mine');
                setNotice(null);
              }}
            >
              Voir
            </button>
            <button type="button" aria-label="Fermer" onClick={() => setNotice(null)}>
              ×
            </button>
          </span>
        </div>
      )}

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

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-b border-outline-variant">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((order) => (
                <AnnouncementCard
                  key={order.id}
                  title={`${shortPlace(order.pickup_address)} → ${shortPlace(order.dropoff_address)}`}
                  meta={[formatKm(order.distance_km), order.duration_min && formatDuration(order.duration_min), timeAgo(order.created_at)]
                    .filter(Boolean)
                    .join(' · ')}
                  description={order.package_type}
                  photoUrl={order.photo_url}
                  photoNote={order.type === 'course' ? 'Course à effectuer' : 'Sans photo'}
                  chips={[
                    { label: order.type === 'course' ? 'Course' : 'Colis' },
                    ...(order.urgency === 'express' ? [{ label: 'Express', tone: 'primary' }] : []),
                  ]}
                  corner={
                    order.my_offer?.status === 'pending' ? (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-on-secondary shadow-sm">Proposition envoyée</span>
                    ) : order.my_offer?.status === 'declined' ? (
                      <span className="rounded-full bg-error px-2.5 py-1 text-xs font-bold text-on-error shadow-sm">Proposition refusée</span>
                    ) : null
                  }
                  price={order.price}
                  priceNote={`gain estimé ${formatFcfa(order.estimated_earnings)}`}
                  onOpen={() => detail.open(order.id)}
                />
              ))}
            </div>
          ))}

        {tab === 'mine' &&
          (mine.length === 0 ? (
            <p className="text-on-surface-variant">Aucune course en cours.</p>
          ) : (
            mine.map((order) => (
              <MyOrderCard
                key={order.id}
                order={order}
                busy={busyOrderId === order.id}
                onAdvance={handleAdvanceStatus}
                onOffer={handleOffer}
                onWithdraw={handleWithdrawOffer}
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
        onOffer={handleOffer}
        onWithdraw={handleWithdrawOffer}
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
