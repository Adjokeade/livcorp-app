import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import { Badge, Pager, SearchInput, Select, useDebounced } from './adminUi';
import { Loading } from './AdminBackOffice';

const STATUS = { pending: ['À examiner', 'warn'], approved: ['Validé', 'ok'], rejected: ['Refusé', 'bad'] };
const PROFESSIONS = [
  ['', 'Tous les métiers'], ['plombier', 'Plombiers'], ['electricien', 'Électriciens'], ['coiffeur', 'Coiffeurs'],
  ['informaticien', 'Informaticiens'], ['menuisier', 'Menuisiers'], ['macon', 'Maçons'], ['mecanicien', 'Mécaniciens'],
  ['couturier', 'Couturiers'], ['peintre', 'Peintres'], ['climatisation', 'Climatisation'], ['menage', 'Ménage'], ['autre', 'Autres'],
];
const PROFESSION_LABEL = {
  plombier: 'Plombier', electricien: 'Électricien', coiffeur: 'Coiffeur / coiffeuse', informaticien: 'Informaticien', menuisier: 'Menuisier',
  macon: 'Maçon', mecanicien: 'Mécanicien', couturier: 'Couturier / couturière', peintre: 'Peintre', climatisation: 'Frigoriste / climatisation',
  menage: 'Ménage et entretien', autre: 'Autre métier',
};

// Candidatures des prestataires de services : à examiner d'abord, puis historique des décisions.
export default function AdminProviders({ onCountChange }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('pending');
  const [profession, setProfession] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, status, profession]);

  useEffect(() => {
    adminService.serviceProviders({ page, q: term || undefined, status: status || undefined, profession: profession || undefined })
      .then((r) => { setResult(r); setError(''); })
      .catch(() => setError('Impossible de charger les candidatures.'));
  }, [page, term, status, profession]);

  // Une décision retire la candidature de la liste « à examiner » et met à jour la pastille du menu.
  function applyDecision(updated) {
    setResult((r) => ({
      ...r,
      total: status && updated.status !== status ? r.total - 1 : r.total,
      data: status && updated.status !== status ? r.data.filter((p) => p.id !== updated.id) : r.data.map((p) => (p.id === updated.id ? updated : p)),
    }));
    onCountChange?.();
  }

  async function approve(provider) {
    setBusyId(provider.id);
    try {
      applyDecision(await adminService.approveServiceProvider(provider.id));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Validation impossible.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(provider) {
    const reason = window.prompt('Motif du refus :');
    if (!reason?.trim()) return;
    setBusyId(provider.id);
    try {
      applyDecision(await adminService.rejectServiceProvider(provider.id, reason.trim()));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Refus impossible.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, téléphone, e-mail, ville…" />
        <Select label="Statut" value={status} onChange={setStatus} options={[['', 'Tous les statuts'], ['pending', 'À examiner'], ['approved', 'Validés'], ['rejected', 'Refusés']]} />
        <Select label="Métier" value={profession} onChange={setProfession} options={PROFESSIONS} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} candidature{result.total > 1 ? 's' : ''}</span>}
      </div>
      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucune candidature ne correspond.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {result.data.map((p) => {
            const [label, tone] = STATUS[p.status] ?? [p.status, 'neutral'];
            return (
              <li key={p.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.first_name} {p.last_name}</p>
                    <p className="text-sm text-on-surface-variant">
                      <a href={`tel:${p.phone}`} className="font-semibold text-secondary">{p.phone}</a>
                      {p.email && <> · {p.email}</>}
                    </p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">{p.profession === 'autre' && p.profession_other ? p.profession_other : PROFESSION_LABEL[p.profession] ?? p.profession}</span>
                  {' · '}{p.experience_years} an{p.experience_years > 1 ? 's' : ''} d'expérience · {p.city}{p.address ? `, ${p.address}` : ''}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">{p.description}</p>
                {p.status === 'rejected' && p.rejection_reason && <p className="mt-2 text-sm text-error">Motif : {p.rejection_reason}</p>}
                <p className="mt-2 text-xs text-on-surface-variant">Reçue le {new Date(p.created_at).toLocaleDateString('fr-FR')}</p>

                <div className="mt-3 flex gap-2">
                  {p.status !== 'rejected' && (
                    <button type="button" disabled={busyId === p.id} onClick={() => reject(p)} className="flex-1 rounded border border-error px-3 py-1.5 text-sm font-semibold text-error sm:flex-none">
                      Refuser
                    </button>
                  )}
                  {p.status !== 'approved' && (
                    <button type="button" disabled={busyId === p.id} onClick={() => approve(p)} className="flex-1 rounded bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary sm:flex-none">
                      {busyId === p.id ? '…' : 'Valider'}
                    </button>
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
