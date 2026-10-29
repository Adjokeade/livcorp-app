import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import { Badge, Pager, SearchInput, Select, useDebounced } from './adminUi';
import { Loading } from './AdminBackOffice';

const STATUS = { pending: ['À examiner', 'warn'], approved: ['Validée', 'ok'], rejected: ['Refusée', 'bad'] };

// Comptes conciergerie : à valider avant qu'ils accèdent aux missions de conciergerie.
export default function AdminConciergeries({ onCountChange }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, status]);

  useEffect(() => {
    adminService.conciergeries({ page, q: term || undefined, status: status || undefined })
      .then((r) => { setResult(r); setError(''); })
      .catch(() => setError('Impossible de charger les conciergeries.'));
  }, [page, term, status]);

  function applyDecision(id, decision) {
    setResult((r) => {
      const leaves = status && decision.conciergerie_status !== status;
      return { ...r, total: leaves ? r.total - 1 : r.total, data: leaves ? r.data.filter((c) => c.id !== id) : r.data.map((c) => (c.id === id ? { ...c, ...decision } : c)) };
    });
    onCountChange?.();
  }

  async function decide(c, approve) {
    let reason;
    if (!approve) {
      reason = window.prompt('Motif du refus :');
      if (!reason?.trim()) return;
    }
    setBusyId(c.id);
    try {
      applyDecision(c.id, approve ? await adminService.approveConciergerie(c.id) : await adminService.rejectConciergerie(c.id, reason.trim()));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, gérant, e-mail, téléphone…" />
        <Select label="Statut" value={status} onChange={setStatus} options={[['', 'Tous les statuts'], ['pending', 'À examiner'], ['approved', 'Validées'], ['rejected', 'Refusées']]} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} conciergerie{result.total > 1 ? 's' : ''}</span>}
      </div>
      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucune conciergerie ne correspond.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {result.data.map((c) => {
            const [label, tone] = STATUS[c.conciergerie_status] ?? [c.conciergerie_status ?? '—', 'neutral'];
            return (
              <li key={c.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.company_name || `${c.first_name} ${c.last_name}`}</p>
                    <p className="text-sm text-on-surface-variant">Gérant : {c.first_name} {c.last_name}</p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-2 text-sm text-on-surface-variant">
                  <a href={`tel:${c.phone}`} className="font-semibold text-secondary">{c.phone}</a> · {c.email}
                  {c.address ? ` · ${c.address}` : ''}
                </p>
                {c.conciergerie_status === 'rejected' && c.conciergerie_rejection_reason && <p className="mt-2 text-sm text-error">Motif : {c.conciergerie_rejection_reason}</p>}
                <p className="mt-2 text-xs text-on-surface-variant">Inscrite le {new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                <div className="mt-3 flex gap-2">
                  {c.conciergerie_status !== 'rejected' && (
                    <button type="button" disabled={busyId === c.id} onClick={() => decide(c, false)} className="flex-1 rounded border border-error px-3 py-1.5 text-sm font-semibold text-error sm:flex-none">Refuser</button>
                  )}
                  {c.conciergerie_status !== 'approved' && (
                    <button type="button" disabled={busyId === c.id} onClick={() => decide(c, true)} className="flex-1 rounded bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary sm:flex-none">{busyId === c.id ? '…' : 'Valider'}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={result?.current_page ?? 1} last={result?.last_page} onChange={setPage} />
    </div>
  );
}
