import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import StatusBadge from '../../components/common/StatusBadge';
import Sheet from '../../components/common/Sheet';
import Button from '../../components/common/Button';
import { formatDate, formatFcfa, formatKm, shortPlace } from '../../lib/format';
import { Badge, Pager, SearchInput, Select, useDebounced } from './adminUi';
import { Loading } from './AdminBackOffice';

const STATUSES = [['', 'Tous les statuts'], ['creee', 'En attente'], ['acceptee', 'Acceptées'], ['colis_recupere', 'Colis récupéré'], ['en_cours_livraison', 'En livraison'], ['livree', 'Livrées'], ['annulee', 'Annulées'], ['litige', 'En litige']];
const CANCELLABLE = ['creee', 'acceptee', 'litige'];

function CancelSheet({ order, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    if (!reason.trim()) return setError('Indiquez le motif de l\'annulation.');
    setBusy(true);
    setError('');
    try {
      await adminService.cancelOrder(order.id, reason.trim());
      onDone(order.id);
    } catch (err) {
      setError(err.response?.data?.errors?.reason?.[0] ?? err.response?.data?.message ?? 'Annulation impossible.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Annuler cette livraison ?"
      subtitle={`#${order.reference}`}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={confirm} disabled={busy} className="flex-1 !bg-error !text-on-error">{busy ? 'Annulation…' : 'Annuler la livraison'}</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">Garder</Button>
        </div>
      }
    >
      <p className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
        Le client{order.deliverer ? ' et le livreur seront prévenus' : ' sera prévenu'}. Le motif est enregistré dans l'historique de la livraison.
      </p>
      <label htmlFor="admin-cancel-reason" className="mt-4 block text-sm font-semibold">Motif (obligatoire)</label>
      <textarea id="admin-cancel-reason" rows={3} maxLength={300} className="textarea-field mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. colis interdit, adresse introuvable, demande du client…" />
      {error && <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
    </Sheet>
  );
}

// Toutes les livraisons de la plateforme : recherche, filtre par statut, annulation d'autorité.
export default function AdminOrders() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, status]);

  useEffect(() => {
    adminService.orders({ page, q: term || undefined, status: status || undefined })
      .then((r) => { setResult(r); setError(''); })
      .catch(() => setError('Impossible de charger les livraisons.'));
  }, [page, term, status]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Référence, client, destinataire, adresse…" />
        <Select label="Statut" value={status} onChange={setStatus} options={STATUSES} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} livraison{result.total > 1 ? 's' : ''}</span>}
      </div>
      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucune livraison ne correspond.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {result.data.map((o) => (
            <li key={o.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    #{o.reference} · {shortPlace(o.pickup_address)} → {shortPlace(o.dropoff_address)}
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    {formatDate(o.created_at)} · {o.distance_km != null ? formatKm(o.distance_km) : '—'} · destinataire {o.recipient_name}
                  </p>
                  <p className="mt-0.5 text-sm text-on-surface-variant">
                    Client : <strong className="text-on-surface">{o.client?.name ?? '—'}</strong>
                    {' · '}Livreur : <strong className="text-on-surface">{o.deliverer?.name ?? 'pas encore'}</strong>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={o.status} />
                  <p className="font-display text-lg font-bold text-primary">{formatFcfa(o.price)}</p>
                  {Number(o.price_suggested) > 0 && Number(o.price) !== Number(o.price_suggested) && (
                    <Badge tone="warn">Barème : {formatFcfa(o.price_suggested)}</Badge>
                  )}
                </div>
              </div>
              {CANCELLABLE.includes(o.status) && (
                <div className="mt-2 text-right">
                  <button type="button" onClick={() => setCancelling(o)} className="text-sm font-semibold text-error hover:underline">Annuler cette livraison</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={result?.current_page ?? 1} last={result?.last_page} onChange={setPage} />

      {cancelling && (
        <CancelSheet
          order={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(id) => {
            setResult((r) => ({ ...r, data: r.data.map((o) => (o.id === id ? { ...o, status: 'annulee' } : o)) }));
            setCancelling(null);
          }}
        />
      )}
    </div>
  );
}
