import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import marketplaceService from '../services/marketplaceService';
import delivererService from '../services/delivererService';
import useAuthStore from '../store/useAuthStore';
import useDetailParam from '../hooks/useDetailParam';
import DeliveryRequestCard, { fromDelivererOrder, fromPublicOrder } from '../components/announcements/DeliveryRequestCard';
import AvailableOrderSheet from '../components/deliverer/AvailableOrderSheet';
import PublicAnnouncementSheet from '../components/announcements/PublicAnnouncementSheet';
import Card from '../components/common/Card';
import TrustBadge from '../components/common/TrustBadge';
import Spinner from '../components/common/Spinner';
import { shortPlace, timeAgo } from '../lib/format';

const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SORTS = {
  recent: { label: 'Plus récentes', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  price_desc: { label: 'Prix le plus élevé', fn: (a, b) => Number(b.price) - Number(a.price) },
  price_asc: { label: 'Prix le plus bas', fn: (a, b) => Number(a.price) - Number(b.price) },
  distance_asc: { label: 'Trajet le plus court', fn: (a, b) => Number(a.distance_km ?? 1e9) - Number(b.distance_km ?? 1e9) },
};

function CardSkeleton() {
  return (
    <div className="card animate-pulse overflow-hidden !p-0" aria-hidden="true">
      <div className="h-28 bg-surface-container" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-2/3 rounded bg-surface-container" />
        <div className="h-4 w-1/2 rounded bg-surface-container" />
        <div className="flex gap-2"><div className="h-6 w-16 rounded-full bg-surface-container" /><div className="h-6 w-16 rounded-full bg-surface-container" /></div>
        <div className="h-7 w-28 rounded bg-surface-container" />
      </div>
    </div>
  );
}

function Segment({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-outline-variant p-0.5">
      {options.map(([key, text]) => (
        <button
          type="button"
          key={key}
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${value === key ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

// Le pouls de la plateforme, en direct : demandes de livraison en attente d'un livreur, et livreurs
// actuellement disponibles avec leur position. Ouvert à tous ; un livreur validé y voit les courses en
// détail et peut les accepter ou proposer son prix sans quitter la page.
export default function Marketplace() {
  const navigate = useNavigate();
  const viewer = useAuthStore((s) => s.user);
  const approvedDeliverer = viewer?.role === 'livreur' && viewer.deliverer?.verification_status === 'approved';
  const [position, setPosition] = useState(null);
  const [orders, setOrders] = useState(null); // modèle brut : public (zones) ou livreur (adresses exactes)
  const [pagination, setPagination] = useState({ page: 1, last: 1 });
  const [deliverers, setDeliverers] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({ q: '', type: 'all', express: false, sort: 'recent' });
  const pagesLoaded = useRef(1);
  const detail = useDetailParam();
  const selected = orders?.find((o) => String(o.id) === detail.openId) ?? null;

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: true },
    );
  }, []);

  // Lecture des annonces : toutes les pages déjà chargées sont relues, pour ne pas perdre le "Voir plus".
  const load = useCallback(async () => {
    try {
      if (approvedDeliverer) {
        const pages = [];
        let last = 1;
        for (let page = 1; page <= pagesLoaded.current; page++) {
          const data = await delivererService.available(page);
          pages.push(...(data.data ?? []));
          last = data.last_page ?? 1;
        }
        setOrders(pages);
        setPagination({ page: pagesLoaded.current, last });
      } else {
        const data = await marketplaceService.orders();
        setOrders(data.data ?? []);
        setPagination({ page: 1, last: 1 });
      }
      setUpdatedAt(Date.now());
    } catch {
      setOrders((prev) => prev ?? []);
    }
  }, [approvedDeliverer]);

  // Les annonces se relisent toutes les 20 s (onglet visible) : une annonce prise disparaît, une nouvelle apparaît.
  useEffect(() => {
    pagesLoaded.current = 1;
    setOrders(null);
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 20000);
    return () => clearInterval(timer);
  }, [load, viewer?.id]);

  // Fait avancer le libellé « actualisé il y a… ».
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

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

  async function refreshNow() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    pagesLoaded.current += 1;
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Action du livreur validé, directement depuis la fiche.
  async function handleAccept(orderId) {
    setBusyId(orderId);
    setActionError('');
    try {
      await delivererService.accept(orderId);
      navigate('/deliverer/tableau-de-bord?onglet=mine');
    } catch (err) {
      setActionError(err.response?.data?.message ?? "Impossible d'accepter cette course. Elle a peut-être été prise.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const cards = useMemo(() => {
    if (!orders) return null;
    const q = normalize(filters.q);
    return orders
      .map((o) => (approvedDeliverer ? fromDelivererOrder(o, shortPlace) : fromPublicOrder(o)))
      .filter((c) => filters.type === 'all' || c.type === filters.type)
      .filter((c) => !filters.express || c.urgency === 'express')
      .filter((c) => !q || normalize(`${c.from} ${c.to} ${c.description} ${c.reference}`).includes(q))
      .sort(SORTS[filters.sort].fn);
  }, [orders, filters, approvedDeliverer]);

  const filtered = filters.q || filters.type !== 'all' || filters.express;
  const resetFilters = () => setFilters({ ...filters, q: '', type: 'all', express: false });
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Annonces</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {approvedDeliverer
              ? 'Les courses ouvertes près de vous : ouvrez une fiche pour voir le détail et l’accepter au prix imposé.'
              : 'L’activité de LIV corp en direct : demandes de livraison en attente et livreurs disponibles.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant">
          {updatedAt && <span>Actualisé {timeAgo(new Date(updatedAt).toISOString())}</span>}
          <button type="button" onClick={refreshNow} disabled={refreshing} className="btn-secondary !px-3 !py-1.5 text-sm">
            {refreshing ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {viewer?.role === 'livreur' && !approvedDeliverer && (
        <p className="mt-4 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Votre dossier livreur n'est pas encore validé : vous pouvez consulter les annonces, mais pas les accepter.{' '}
          <Link to="/deliverer/tableau-de-bord" className="font-semibold underline">Voir mon dossier</Link>
        </p>
      )}
      {error && <p className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
      {actionError && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{actionError}</p>}

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">
          Demandes de livraison{cards ? <span className="ml-2 text-sm font-medium text-on-surface-variant">{cards.length}{filtered && orders ? ` sur ${orders.length}` : ''}</span> : null}
        </h2>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Chercher un quartier, une ville, un colis…"
            aria-label="Chercher une annonce"
            className="input-field lg:max-w-xs"
          />
          <Segment label="Type" value={filters.type} onChange={(type) => set({ type })} options={[['all', 'Tout'], ['colis', 'Colis'], ['course', 'Courses']]} />
          <button
            type="button"
            onClick={() => set({ express: !filters.express })}
            aria-pressed={filters.express}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${filters.express ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant' : 'border-outline-variant text-on-surface-variant'}`}
          >
            Express seulement
          </button>
          <label className="flex items-center gap-2 text-sm lg:ml-auto">
            <span className="text-on-surface-variant">Trier par</span>
            <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })} className="input-field !w-auto !py-2">
              {Object.entries(SORTS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {!cards ? (
            [0, 1, 2].map((i) => <CardSkeleton key={i} />)
          ) : cards.length === 0 ? (
            <div className="col-span-full rounded-xl bg-surface-container-lowest p-8 text-center shadow-card">
              <p className="font-semibold">{filtered ? 'Aucune annonce ne correspond à votre recherche.' : 'Aucune demande de livraison en attente pour le moment.'}</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {filtered ? 'Essayez un autre quartier ou retirez un filtre.' : 'Les nouvelles demandes apparaissent ici dès leur publication.'}
              </p>
              {filtered && <button type="button" onClick={resetFilters} className="btn-secondary mt-4">Réinitialiser les filtres</button>}
            </div>
          ) : (
            cards.map((card) => <DeliveryRequestCard key={card.id} request={card} onOpen={() => detail.open(card.id)} />)
          )}
        </div>

        {approvedDeliverer && pagination.page < pagination.last && (
          <div className="mt-6 text-center">
            <button type="button" onClick={loadMore} disabled={refreshing} className="btn-secondary">
              {refreshing ? 'Chargement…' : 'Voir plus de courses'}
            </button>
          </div>
        )}
      </section>

      {approvedDeliverer ? (
        <AvailableOrderSheet
          open={Boolean(detail.openId) && orders !== null}
          order={selected}
          unavailableReason="gone"
          busy={busyId !== null && String(busyId) === detail.openId}
          onClose={detail.close}
          onAccept={handleAccept}
        />
      ) : (
        <PublicAnnouncementSheet
          open={Boolean(detail.openId) && orders !== null}
          order={selected}
          viewer={viewer}
          onClose={detail.close}
        />
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold">Livreurs disponibles</h2>
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!deliverers ? (
              <div className="col-span-full flex min-h-[15vh] items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : deliverers.length === 0 ? (
              <p className="col-span-full text-on-surface-variant">Aucun livreur disponible pour le moment.</p>
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
