import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import { Badge, Pager, SearchInput, Select, useDebounced } from './adminUi';
import { Loading } from './AdminBackOffice';
import { PROFESSION_LABEL } from '../../lib/professions';
import { formatFcfa } from '../../lib/format';

const STATUS = { open: ['Ouverte', 'warn'], taken: ['Prise', 'ok'], cancelled: ['Annulée', 'bad'] };

// Offres de prestation publiées par les clients : suivi, prestataire qui les a prises, retrait en cas d'abus.
export default function AdminServiceRequests() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [profession, setProfession] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, status, profession]);

  useEffect(() => {
    adminService.serviceRequests({ page, q: term || undefined, status: status || undefined, profession: profession || undefined })
      .then((r) => { setResult(r); setError(''); })
      .catch(() => setError('Impossible de charger les offres.'));
  }, [page, term, status, profession]);

  async function cancel(offer) {
    if (!window.confirm(`Retirer l'offre « ${offer.title} » ?`)) return;
    setBusyId(offer.id);
    try {
      const updated = await adminService.cancelServiceRequest(offer.id);
      setResult((r) => ({ ...r, data: r.data.map((o) => (o.id === offer.id ? updated : o)) }));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Titre, description, ville…" />
        <Select label="Statut" value={status} onChange={setStatus} options={[['', 'Tous les statuts'], ['open', 'Ouvertes'], ['taken', 'Prises'], ['cancelled', 'Annulées']]} />
        <Select label="Métier" value={profession} onChange={setProfession} options={[['', 'Tous les métiers'], ...Object.entries(PROFESSION_LABEL)]} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} offre{result.total > 1 ? 's' : ''}</span>}
      </div>
      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucune offre ne correspond.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {result.data.map((o) => {
            const [label, tone] = STATUS[o.status] ?? [o.status, 'neutral'];
            return (
              <li key={o.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-semibold">{o.title}</p>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {PROFESSION_LABEL[o.profession] ?? o.profession} · {o.city}{o.budget ? ` · ${formatFcfa(o.budget)}` : ''}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">{o.description}</p>
                <p className="mt-2 text-sm">
                  Client : <span className="font-semibold">{o.client?.first_name} {o.client?.last_name}</span> · {o.client?.phone}
                </p>
                {o.provider && (
                  <p className="text-sm">
                    Prestataire : <span className="font-semibold">{o.provider.first_name} {o.provider.last_name}</span> · {o.provider.phone}
                  </p>
                )}
                <p className="mt-2 text-xs text-on-surface-variant">Publiée le {new Date(o.created_at).toLocaleDateString('fr-FR')}</p>
                {o.status !== 'cancelled' && (
                  <button type="button" disabled={busyId === o.id} onClick={() => cancel(o)} className="mt-3 rounded border border-error px-3 py-1.5 text-sm font-semibold text-error">
                    Retirer l'offre
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={result?.current_page ?? 1} last={result?.last_page} onChange={setPage} />
    </div>
  );
}
