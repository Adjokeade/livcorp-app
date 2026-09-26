import { useEffect, useState } from 'react';
import merchantService from '../../services/merchantService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';

// Cf. prompt frontend §3 "Commerçant" : profil boutique, réception/gestion des
// commandes, tableau de bord (commandes, CA, commissions dues).
export default function MerchantDashboard() {
  const [shop, setShop] = useState(null);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    merchantService
      .getShop()
      .catch(() => null)
      .then((data) => setShop(data ?? { shop_name: '', shop_address: '', shop_phone: '' }));
    merchantService.stats().then(setStats);
    merchantService.orders().then((data) => setOrders(data.data ?? []));
  }, []);

  async function handleSaveShop(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const updated = await merchantService.updateShop({
        shop_name: shop.shop_name,
        shop_address: shop.shop_address,
        shop_phone: shop.shop_phone,
      });
      setShop(updated);
      setNotice('Boutique mise à jour. Toute modification substantielle repasse en attente de validation.');
    } finally {
      setSaving(false);
    }
  }

  if (!shop || !stats || !orders) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="font-display text-2xl font-bold">Tableau de bord : {shop.shop_name || 'Ma boutique'}</h1>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Commandes totales" value={stats.orders_total} />
          <StatCard label="En cours" value={stats.orders_in_progress} accent />
          <StatCard label="Livrées" value={stats.orders_delivered} />
          <StatCard label="CA total" value={`${stats.revenue_total} FCFA`} />
        </div>

        <h2 className="mt-8 font-display text-lg font-bold">Commandes récentes</h2>
        <div className="mt-3 flex flex-col gap-3">
          {orders.length === 0 && <p className="text-on-surface-variant">Aucune commande pour le moment.</p>}
          {orders.map((order) => (
            <Card key={order.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">#{order.reference}</p>
                <p className="text-sm text-on-surface-variant">
                  {order.client?.first_name} {order.client?.last_name}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="font-display font-bold text-primary">{order.price} FCFA</span>
                <StatusBadge status={order.status} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="h-fit">
        <h2 className="font-display text-lg font-bold">Profil boutique</h2>
        {notice && <p className="mt-3 rounded bg-primary-fixed px-3 py-2 text-xs text-on-primary-fixed-variant">{notice}</p>}
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSaveShop}>
          <Input
            label="Nom de la boutique"
            value={shop.shop_name ?? ''}
            onChange={(e) => setShop({ ...shop, shop_name: e.target.value })}
          />
          <Input
            label="Adresse"
            value={shop.shop_address ?? ''}
            onChange={(e) => setShop({ ...shop, shop_address: e.target.value })}
          />
          <Input
            label="Téléphone boutique"
            value={shop.shop_phone ?? ''}
            onChange={(e) => setShop({ ...shop, shop_phone: e.target.value })}
          />
          <Button type="submit" disabled={saving} className="mt-2 w-full">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`card ${accent ? 'bg-primary-fixed' : ''}`}>
      <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}
