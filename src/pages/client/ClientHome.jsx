import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import clientOrderService from '../../services/clientOrderService';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';
import { formatFcfa, shortPlace, timeAgo } from '../../lib/format';

const ACTIVE = ['creee', 'acceptee', 'colis_recupere', 'en_cours_livraison', 'litige'];

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-on-surface-variant">{label}</p>
    </div>
  );
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function trend(now, before) {
  if (!before) return now ? 'Nouveau' : '—';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? '+' : ''}${pct} % vs mois dernier`;
}

// Vue d'ensemble de l'entreprise : comparaison au mois précédent, fiabilité et volume des six derniers mois.
function EnterpriseStats({ stats }) {
  const { this_month: now, last_month: before, history } = stats;
  const peak = Math.max(1, ...history.map((h) => h.total));

  return (
    <section className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
      <h2 className="font-display text-lg font-bold">Activité de l'entreprise</h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-on-surface-variant">Livraisons demandées ce mois-ci</dt>
          <dd className="text-xl font-bold">{now.total}</dd>
          <dd className="text-xs text-on-surface-variant">{trend(now.total, before.total)}</dd>
        </div>
        <div>
          <dt className="text-sm text-on-surface-variant">Taux de réussite</dt>
          <dd className="text-xl font-bold">{now.success_rate === null ? '—' : `${now.success_rate} %`}</dd>
          <dd className="text-xs text-on-surface-variant">{now.cancelled} annulée{now.cancelled > 1 ? 's' : ''} ce mois-ci</dd>
        </div>
        <div>
          <dt className="text-sm text-on-surface-variant">Dépenses du mois dernier</dt>
          <dd className="text-xl font-bold">{formatFcfa(before.spent)}</dd>
          <dd className="text-xs text-on-surface-variant">{before.delivered} livrée{before.delivered > 1 ? 's' : ''}</dd>
        </div>
      </dl>

      <div className="mt-5 flex h-28 items-end gap-2" role="img" aria-label={`Livraisons demandées par mois : ${history.map((h) => `${MONTHS[Number(h.month.slice(5)) - 1]} ${h.total}`).join(', ')}`}>
        {history.map((h) => (
          <div key={h.month} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold">{h.total}</span>
            <div className="w-full rounded-t bg-primary" style={{ height: `${(h.total / peak) * 70 + 2}px` }} />
            <span className="text-[11px] text-on-surface-variant">{MONTHS[Number(h.month.slice(5)) - 1]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Accueil de l'expéditeur : l'essentiel de son activité et le raccourci vers une nouvelle livraison.
export default function ClientHome() {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    clientOrderService.list().then((data) => setOrders(data.data ?? [])).catch(() => setOrders([]));
    clientOrderService.stats().then(setStats).catch(() => {});
  }, []);

  if (!orders) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const isEntreprise = user.account_type === 'entreprise';
  const greeting = user.account_type === 'entreprise' && user.company_name ? user.company_name : user.first_name;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Bonjour, {greeting}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Voici votre activité de livraison.</p>
        </div>
        <Link to="/client/commander" className="btn-primary">Nouvelle livraison</Link>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="En cours" value={stats.in_progress} />
          <Stat label="Livrées ce mois-ci" value={stats.this_month.delivered} />
          <Stat label="À noter" value={stats.to_review} />
          <Stat label="Dépensé ce mois-ci" value={formatFcfa(stats.this_month.spent)} />
        </div>
      )}

      {stats && isEntreprise && <EnterpriseStats stats={stats} />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{active.length ? 'Livraisons en cours' : 'Dernières livraisons'}</h2>
          <Link to="/client/commandes" className="text-sm font-semibold text-secondary">Tout voir</Link>
        </div>

        {orders.length === 0 ? (
          <div className="mt-3 rounded-xl bg-surface-container-lowest p-8 text-center shadow-card">
            <p className="text-on-surface-variant">Vous n'avez pas encore de livraison.</p>
            <Link to="/client/commander" className="btn-primary mt-4 inline-flex">Commander une livraison</Link>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(active.length ? active : orders).slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link to={`/client/suivi/${o.id}`} className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold sm:truncate">{shortPlace(o.pickup_address)} → {shortPlace(o.dropoff_address)}</p>
                    <p className="text-xs text-on-surface-variant">#{o.reference} · {timeAgo(o.created_at)}</p>
                  </div>
                  <StatusBadge status={o.status} className="w-fit shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
