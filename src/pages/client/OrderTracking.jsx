import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clientOrderService from '../../services/clientOrderService';
import Card from '../../components/common/Card';
import StatusBadge, { displayStatus } from '../../components/common/StatusBadge';
import TrustBadge from '../../components/common/TrustBadge';
import Spinner from '../../components/common/Spinner';
import Stars from '../../components/common/Stars';
import ReviewForm from '../../components/client/ReviewForm';
import PaymentCard from '../../components/client/PaymentCard';
import OrderSummaryCard from '../../components/client/OrderSummaryCard';
import CancelOrderCard from '../../components/client/CancelOrderCard';
import { formatDate, formatTime } from '../../lib/format';
import TrackingMap from '../../components/client/TrackingMap';
import LiveTrackingCard from '../../components/client/LiveTrackingCard';
import Avatar from '../../components/common/Avatar';
import FavoriteButton from '../../components/client/FavoriteButton';
import OrderTimeline from '../../components/client/OrderTimeline';
import ConfirmDeliveryCard from '../../components/client/ConfirmDeliveryCard';
import UnreachableCard from '../../components/client/UnreachableCard';
import ChatSheet from '../../components/common/ChatSheet';
import PhotoViewer from '../../components/common/PhotoViewer';
import useOrderTracking from '../../hooks/useOrderTracking';

// Microcopie chaleureuse par statut — cf. prompt frontend §5 "Expérience hyper humaine" :
// "Amina a récupéré votre colis, elle arrive dans 12 min" plutôt que "Statut : en transit".
function humanMessage(order) {
  const name = order?.deliverer?.user?.first_name;
  switch (order?.status) {
    case 'creee':
      if (order.awaiting_payment) {
        return 'Votre livraison attend votre paiement : elle sera publiée aux livreurs dès qu\'il sera confirmé.';
      }
      if ((order.status_history ?? []).some((h) => h.status === 'creee' && h.note?.startsWith('Désistement'))) {
        return "Votre précédent livreur ne peut plus assurer la course. Elle est de nouveau proposée aux livreurs : vous serez prévenu dès qu'un livreur l'accepte.";
      }
      return 'Nous cherchons un livreur disponible près de chez vous…';
    case 'acceptee':
      return `${name ?? 'Votre livreur'} a accepté votre course et se dirige vers le point de collecte.`;
    case 'colis_recupere':
      return `${name ?? 'Votre livreur'} a récupéré votre colis, il arrive !`;
    case 'en_cours_livraison':
      return `${name ?? 'Votre livreur'} est en route vers vous. À la remise du colis, vous validez le paiement.`;
    case 'livree':
      return 'Livraison effectuée. Merci d\'avoir fait confiance à LIV corp !';
    case 'annulee':
      return 'Cette commande a été annulée.';
    case 'remise':
      return `${name ?? 'Votre livreur'} a remis le colis et envoyé la photo de réception : confirmez la réception pour que l'argent lui soit versé.`;
    case 'litige':
      return 'Un souci est survenu sur cette commande, notre équipe examine la situation. Votre argent reste bloqué en sécurité en attendant.';
    default:
      return 'Suivi de votre commande…';
  }
}

export default function OrderTracking() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [chatOpen, setChatOpen] = useState(searchParams.get('chat') === '1');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  // Incrémenté à chaque action de l'utilisateur (accepter, refuser, payer, noter) : une relecture
  // lancée avant l'action et arrivée après porte des données périmées et doit être ignorée.
  const localChanges = useRef(0);
  const applyLocal = (updater) => {
    localChanges.current += 1;
    setOrder(updater);
  };

  useEffect(() => {
    let cancelled = false;
    clientOrderService
      .show(orderId)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Changement de statut poussé par le serveur temps réel (quand il est configuré) ; sinon la relecture ci-dessous suffit.
  const handleStatusChanged = useCallback((payload) => {
    setOrder((prev) => (prev ? { ...prev, status: payload.status } : prev));
  }, []);

  // Relecture périodique tant que la commande est en cours : statut du livreur et paiement
  // (confirmation KKiaPay par webhook comprise) se mettent à jour sans recharger la page,
  // même quand la diffusion temps réel n'est pas active.
  const isActive = order && !['livree', 'annulee'].includes(order.status);
  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => {
      const startedAt = localChanges.current;
      clientOrderService
        .show(orderId)
        .then((fresh) => {
          if (startedAt === localChanges.current) setOrder((prev) => (prev ? { ...prev, ...fresh } : fresh));
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [isActive, orderId]);

  const tracking = useOrderTracking(orderId, order, handleStatusChanged);

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

  const cancelReason = (order.status_history ?? [])
    .filter((entry) => entry.status === 'annulee' && entry.note)
    .map((entry) => entry.note.replace(/^Annulée par le client\s*:?\s*/, '').trim())
    .pop();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {order.awaiting_payment && (
        <div className="flex flex-col gap-4 lg:col-span-2">
          <PaymentCard order={order} autoPay={searchParams.get('payer') === '1'} onPaid={(paid) => applyLocal((prev) => ({ ...prev, ...paid }))} />
        </div>
      )}

      {order.status === 'remise' && (
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ConfirmDeliveryCard order={order} delivererName={order.deliverer?.user?.first_name} onChanged={(updated) => applyLocal((prev) => ({ ...prev, ...updated }))} />
        </div>
      )}

      {(['acceptee', 'colis_recupere', 'en_cours_livraison'].includes(order.status) && order.deliverer) || order.status === 'litige' ? (
        <div className="flex flex-col gap-4 lg:col-span-2">
          {order.status === 'litige' ? (
            <UnreachableCard
              order={order}
              delivererName={order.deliverer?.user?.first_name}
              onRetried={(updated) => applyLocal((prev) => ({ ...prev, ...updated }))}
            />
          ) : (
            <LiveTrackingCard order={order} tracking={tracking} />
          )}
        </div>
      ) : null}

      <TrackingMap order={order} tracking={tracking} />

      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-2">
            <StatusBadge status={displayStatus(order)} />
            <span className="text-xs text-on-surface-variant">#{order.reference}</span>
          </div>
          <p className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            {humanMessage(order)}
          </p>
        </Card>

        {order.deliverer && (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar src={order.deliverer.user?.avatar_url} name={order.deliverer.user?.first_name} size="md" />
              <div className="min-w-0 flex-1 basis-32">
                <p className="font-semibold">{order.deliverer.user?.first_name}</p>
                <TrustBadge icon="⭐">
                  {Number(order.deliverer.average_rating) > 0
                    ? `${Number(order.deliverer.average_rating).toFixed(1)}/5`
                    : 'Nouveau'}{' '}
                  · {order.deliverer.total_deliveries ?? 0} livraison{order.deliverer.total_deliveries > 1 ? 's' : ''}
                </TrustBadge>
                {(order.deliverer.vehicle_type || order.deliverer.vehicle_plate) && (
                  <p className="mt-1 text-xs capitalize text-on-surface-variant">
                    {[order.deliverer.vehicle_type, order.deliverer.vehicle_plate].filter(Boolean).join(' · ')}
                  </p>
                )}
                <FavoriteButton order={order} />
              </div>
              <div className="flex w-full flex-shrink-0 items-center gap-2 min-[400px]:w-auto">
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  aria-haspopup="dialog"
                  className="relative rounded-full bg-primary-fixed px-3.5 py-2 text-sm font-semibold text-on-primary-fixed-variant"
                >
                  {order.status === 'livree' ? 'Messages' : 'Écrire'}
                  {order.unread_messages_count > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
                      {order.unread_messages_count}
                    </span>
                  )}
                </button>
                {order.deliverer.user?.phone && (
                  <a href={`tel:${order.deliverer.user.phone}`} className="rounded-full bg-surface-container px-3.5 py-2 text-sm font-semibold text-secondary">
                    Appeler
                  </a>
                )}
              </div>
            </div>
          </Card>
        )}

        {!order.awaiting_payment && <PaymentCard order={order} delivererName={order.deliverer?.user?.first_name} onPaid={(paid) => applyLocal((prev) => ({ ...prev, ...paid }))} />}

        {order.status === 'livree' && order.deliverer && (
          <Card>
            {order.review ? (
              <div>
                <h2 className="text-sm font-semibold text-on-surface-variant">VOTRE AVIS</h2>
                <Stars value={order.review.rating} className="mt-2 text-2xl" />
                {order.review.comment && <p className="mt-2 text-sm">{order.review.comment}</p>}
                <p className="mt-2 text-sm text-on-surface-variant">Merci, votre avis a bien été pris en compte.</p>
              </div>
            ) : (
              <ReviewForm
                orderId={order.id}
                delivererName={order.deliverer.user?.first_name}
                onSaved={(review) => applyLocal((prev) => ({ ...prev, review }))}
              />
            )}
          </Card>
        )}

        {order.status === 'livree' && order.delivery_photo_url && (
          <Card className="overflow-hidden !p-0">
            <PhotoViewer src={order.delivery_photo_url} alt="Preuve de remise" className="h-44 rounded-none" />
            <div className="p-4">
              <h2 className="text-sm font-semibold text-on-surface-variant">PREUVE DE REMISE</h2>
              <p className="mt-1 text-sm">
                Photo de réception envoyée par le livreur{order.handed_over_at ? ` à ${formatTime(order.handed_over_at)}` : ''}, réception confirmée{order.delivered_at ? ` à ${formatTime(order.delivered_at)}` : ''}.
              </p>
            </div>
          </Card>
        )}

        {order.status === 'annulee' && (
          <Card className="border border-outline-variant">
            <h2 className="font-display text-lg font-bold">Commande annulée</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {order.cancelled_at ? `Annulée le ${formatDate(order.cancelled_at)}. ` : ''}
              {order.payment_status === 'rembourse' ? 'Votre paiement vous est remboursé.' : 'Rien n\'a été facturé.'}
            </p>
            {cancelReason && <p className="mt-2 rounded bg-surface-container px-3 py-2 text-sm">Motif : {cancelReason}</p>}
            <Link to="/client/commander" className="btn-primary mt-4 w-full">
              Refaire une commande
            </Link>
          </Card>
        )}

        <OrderSummaryCard order={order} />

        <CancelOrderCard
          order={order}
          delivererName={order.deliverer?.user?.first_name}
          onCancelled={(cancelled) => applyLocal((prev) => ({ ...prev, ...cancelled }))}
        />

        {order.status === 'annulee' && (
          <Card className="!p-4 text-center">
            <button
              type="button"
              className="text-sm font-semibold text-error hover:underline"
              onClick={async () => {
                try {
                  await clientOrderService.hide(order.id);
                  navigate('/client/commandes');
                } catch {
                  // la demande reste visible : l'utilisateur peut réessayer
                }
              }}
            >
              Retirer de ma liste
            </button>
            <p className="mt-1 text-xs text-on-surface-variant">Elle disparaît de vos livraisons, sans effet sur la plateforme.</p>
          </Card>
        )}

        {order.status !== 'annulee' && <OrderTimeline order={order} />}
      </div>
      {order.deliverer && (
        <ChatSheet
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          orderId={order.id}
          otherName={order.deliverer.user?.first_name}
          quickMessages={['Je vous attends', 'Je descends vous ouvrir', "L'entrée est à gauche", 'Pouvez-vous m\'appeler ?', 'Merci !']}
          warning="Ne confirmez la réception qu'après avoir vu le colis ou la photo de réception. Ne payez jamais en dehors de l'application."
          onRead={() => setOrder((prev) => (prev && prev.unread_messages_count ? { ...prev, unread_messages_count: 0 } : prev))}
        />
      )}
    </div>
  );
}
