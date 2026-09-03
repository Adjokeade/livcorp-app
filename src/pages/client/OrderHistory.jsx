import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clientOrderService from '../../services/clientOrderService';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';

export default function OrderHistory() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    clientOrderService.list().then((data) => setOrders(data.data ?? []));
  }, []);

  if (!orders) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Mes commandes</h1>
      <div className="mt-6 flex flex-col gap-3">
        {orders.length === 0 && <p className="text-on-surface-variant">Aucune commande pour le moment.</p>}
        {orders.map((order) => (
          <Link key={order.id} to={`/client/suivi/${order.id}`}>
            <Card className="flex items-center justify-between transition hover:shadow-modal">
              <div>
                <p className="font-semibold">#{order.reference}</p>
                <p className="text-sm text-on-surface-variant">
                  {order.pickup_address} → {order.dropoff_address}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-primary">{order.price} FCFA</span>
                <StatusBadge status={order.status} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
