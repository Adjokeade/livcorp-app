import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import adminService from '../../services/adminService';
import Avatar from '../../components/common/Avatar';
import { Badge, DOC_LABEL, Pager, SearchInput, Select, openDocument, useDebounced } from './adminUi';
import { DelivererValidation, Loading } from './AdminBackOffice';

const STATUS = { pending: ['En attente', 'warn'], approved: ['Validé', 'ok'], rejected: ['Refusé', 'bad'] };

function Directory() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, status]);

  useEffect(() => {
    adminService.deliverers({ page, q: term || undefined, status: status || undefined })
      .then((r) => { setResult(r); setError(''); })
      .catch(() => setError('Impossible de charger les livreurs.'));
  }, [page, term, status]);

  async function toggle(d) {
    const next = !d.user.is_active;
    if (!next && !window.confirm(`Suspendre ${d.user.first_name} ${d.user.last_name} ? Il sera déconnecté et ne recevra plus de courses.`)) return;
    setBusyId(d.id);
    try {
      await adminService.setUserActive(d.user.id, next);
      setResult((r) => ({ ...r, data: r.data.map((x) => (x.id === d.id ? { ...x, user: { ...x.user, is_active: next } } : x)) }));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, e-mail, téléphone…" />
        <Select label="Statut du dossier" value={status} onChange={setStatus} options={[['', 'Tous les dossiers'], ['approved', 'Validés'], ['pending', 'En attente'], ['rejected', 'Refusés']]} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} livreur{result.total > 1 ? 's' : ''}</span>}
      </div>
      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucun livreur ne correspond.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {result.data.map((d) => {
            const [label, tone] = STATUS[d.verification_status] ?? [d.verification_status, 'neutral'];
            return (
              <li key={d.id} className={`rounded-xl bg-surface-container-lowest p-4 shadow-card ${d.user.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <Avatar src={d.user.avatar_url} name={d.user.first_name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.user.first_name} {d.user.last_name}</p>
                    <p className="truncate text-sm text-on-surface-variant">{d.user.email} · {d.user.phone}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone={tone}>{label}</Badge>
                      {d.is_available && d.verification_status === 'approved' && <Badge tone="ok">Disponible</Badge>}
                      {!d.user.is_active && <Badge tone="bad">Suspendu</Badge>}
                      {!d.user.avatar_url && <Badge tone="bad">Sans photo</Badge>}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-surface-container p-2"><dt className="text-on-surface-variant">Note</dt><dd className="text-sm font-bold">{Number(d.average_rating) > 0 ? `${Number(d.average_rating).toFixed(1)}/5` : '—'}</dd></div>
                  <div className="rounded bg-surface-container p-2"><dt className="text-on-surface-variant">Livraisons</dt><dd className="text-sm font-bold">{d.total_deliveries ?? 0}</dd></div>
                  <div className="rounded bg-surface-container p-2"><dt className="text-on-surface-variant">En cours</dt><dd className="text-sm font-bold">{d.in_progress_count}</dd></div>
                </dl>
                {/* Pièces justificatives : s'ouvrent directement, pour tous les livreurs et pas seulement les dossiers en attente. */}
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-on-surface-variant">Pièces :</span>
                  {(d.user.documents ?? []).length === 0 && <span className="text-on-surface-variant">aucune</span>}
                  {(d.user.documents ?? []).map((doc) => (
                    <button key={doc.id} type="button" onClick={() => openDocument(doc)} className="font-semibold text-secondary underline">
                      {DOC_LABEL[doc.type] ?? doc.type}
                    </button>
                  ))}
                </p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs capitalize text-on-surface-variant">{d.vehicle_type}{d.vehicle_plate ? ` · ${d.vehicle_plate}` : ''}</span>
                  <Link to={`/admin/livreurs/${d.id}`} className="rounded border border-primary px-3 py-1.5 text-sm font-semibold text-primary">Voir le profil</Link>
                  <button
                    type="button"
                    disabled={busyId === d.id}
                    onClick={() => toggle(d)}
                    className={`rounded border px-3 py-1.5 text-sm font-semibold ${d.user.is_active ? 'border-error text-error' : 'border-secondary text-secondary'}`}
                  >
                    {d.user.is_active ? 'Suspendre' : 'Réactiver'}
                  </button>
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

// Livreurs : validation des dossiers en attente, puis annuaire de tous les livreurs.
export default function AdminDeliverers() {
  const [view, setView] = useState('pending');

  return (
    <div>
      <div role="group" aria-label="Affichage" className="inline-flex rounded-lg border border-outline-variant p-0.5">
        {[['pending', 'Dossiers à valider'], ['all', 'Tous les livreurs']].map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === key ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">{view === 'pending' ? <DelivererValidation /> : <Directory />}</div>
    </div>
  );
}
