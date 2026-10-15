import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clientOrderService from '../../services/clientOrderService';
import CancelOrderCard from '../../components/client/CancelOrderCard';
import AnnouncementCard from '../../components/announcements/AnnouncementCard';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';
import Stars from '../../components/common/Stars';
import useAuthStore from '../../store/useAuthStore';
import { formatDuration, formatKm, shortPlace, timeAgo } from '../../lib/format';

// Mes annonces : chaque commande est une carte (photo, trajet, prix, statut) qui ouvre le suivi détaillé.
export default function OrderHistory() {
  const [orders, setOrders] = useState(null);
  const me = useAuthStore((s) => s.user);

  useEffect(() => {
    clientOrderService.list().then((data) => setOrders(data.data ?? []));
  }, []);

  async function removeOrder(id) {
    try {
      await clientOrderService.hide(id);
      setOrders((list) => list.filter((o) => o.id !== id));
    } catch {
      // la demande reste visible : l'utilisateur peut réessayer
    }
  }

  if (!orders) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Mes commandes</h1>
        <Link to="/client/commander" className="btn-primary !px-4 !py-2 text-sm">
          Nouvelle commande
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl bg-surface-container-lowest p-8 text-center shadow-card">
          <p className="text-on-surface-variant">Aucune commande pour le moment.</p>
          <Link to="/client/commander" className="btn-primary mt-4 inline-flex">
            Commander une livraison
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <div key={order.id} className="flex flex-col gap-2">
            <AnnouncementCard
              to={`/client/suivi/${order.id}`}
              title={`${shortPlace(order.pickup_address)} → ${shortPlace(order.dropoff_address)}`}
              meta={[`#${order.reference}`, order.client && order.client.id !== me?.id && `par ${order.client.first_name}`, formatKm(order.distance_km), order.duration_min && formatDuration(order.duration_min), timeAgo(order.created_at)]
                .filter(Boolean)
                .join(' · ')}
              description={order.package_type}
              photoUrl={order.photo_url}
              photoNote={order.type === 'course' ? 'Course' : 'Sans photo'}
              corner={<StatusBadge status={order.status} />}
              price={order.price}
              priceNote={
                order.unread_messages_count > 0 ? (
                  <span className="font-semibold text-primary">
                    {order.unread_messages_count} message{order.unread_messages_count > 1 ? 's' : ''} non lu{order.unread_messages_count > 1 ? 's' : ''}
                  </span>
                ) : order.status === 'livree' ? (
                  order.review ? <Stars value={order.review.rating} /> : <span className="font-semibold text-primary">À noter</span>
                ) : undefined
              }
              cta={['acceptee', 'colis_recupere', 'en_cours_livraison'].includes(order.status) ? 'Suivre en direct' : order.status === 'livree' ? 'Détails' : 'Suivre'}
            />
            {(order.status === 'creee' || order.status === 'acceptee' || order.status === 'annulee') && (
              <div className="flex items-center justify-between gap-3 px-1">
                {order.status === 'annulee' ? (
                  <>
                    <span className="text-xs text-on-surface-variant">Demande annulée</span>
                    <button type="button" onClick={() => removeOrder(order.id)} className="text-sm font-semibold text-error hover:underline">
                      Retirer de ma liste
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-on-surface-variant">
                      {order.status === 'creee' ? 'Pas encore prise par un livreur' : 'Acceptée, pas encore récupérée'}
                    </span>
                    <CancelOrderCard
                      compact
                      order={order}
                      delivererName={order.deliverer?.user?.first_name}
                      onCancelled={(cancelled) => setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status: cancelled.status } : o)))}
                    />
                  </>
                )}
              </div>
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
