import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import Avatar from '../../components/common/Avatar';
import Sheet from '../../components/common/Sheet';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatFcfa } from '../../lib/format';
import { Badge, Pager, SearchInput, Select, useDebounced } from './adminUi';
import { Loading } from './AdminBackOffice';

const ROLE = { client: 'Client', livreur: 'Livreur', commercant: 'Commerçant' };

const isCompanyOwner = (u) => u.role === 'client' && u.account_type === 'entreprise' && !u.company_id;

// Tarif négocié avec une entreprise : remplace le barème standard pour toute son équipe.
function TariffSheet({ user, onClose, onSaved }) {
  const [standard, setStandard] = useState(null);
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, error: '', fields: {} });

  useEffect(() => {
    adminService.tariff().then((d) => {
      setStandard(d.tariff);
      const base = user.custom_tariff ?? d.tariff;
      setForm(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)])));
    });
  }, [user.custom_tariff]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const num = (key) => Number(form?.[key]) || 0;
  const preview = (km) => Math.round((num('base_fare') + km * num('per_km')) / 10) * 10;
  const standardPreview = (km) => Math.round(((standard?.base_fare ?? 0) + km * (standard?.per_km ?? 0)) / 10) * 10;

  async function save(e) {
    e.preventDefault();
    setState({ busy: true, error: '', fields: {} });
    try {
      const saved = await adminService.setUserTariff(user.id, { base_fare: num('base_fare'), per_km: num('per_km'), express_multiplier: num('express_multiplier') });
      onSaved(saved.custom_tariff);
    } catch (err) {
      const raw = err.response?.data?.errors ?? {};
      setState({ busy: false, fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]])), error: Object.keys(raw).length ? '' : (err.response?.data?.message ?? 'Enregistrement impossible.') });
    }
  }

  async function reset() {
    setState({ busy: true, error: '', fields: {} });
    try {
      await adminService.clearUserTariff(user.id);
      onSaved(null);
    } catch {
      setState({ busy: false, error: 'Impossible de revenir au barème standard.', fields: {} });
    }
  }

  return (
    <Sheet open onClose={() => !state.busy && onClose()} title="Tarif négocié" subtitle={user.company_name || `${user.first_name} ${user.last_name}`}>
      {!form ? <Loading /> : (
        <form className="flex flex-col gap-4" onSubmit={save}>
          <p className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            Ce tarif remplace le barème standard pour toutes les livraisons de l'entreprise et de son équipe. Il reste imposé : ni les livreurs ni l'entreprise ne peuvent le modifier.
          </p>
          <Input label="Tarif de base (FCFA)" type="number" min="0" required value={form.base_fare} onChange={set('base_fare')} error={state.fields.base_fare} />
          <Input label="Prix au kilomètre (FCFA)" type="number" min="0" required value={form.per_km} onChange={set('per_km')} error={state.fields.per_km} />
          <Input label="Majoration express (multiplicateur)" type="number" min="1" max="5" step="0.05" required value={form.express_multiplier} onChange={set('express_multiplier')} error={state.fields.express_multiplier} />

          <table className="w-full text-sm">
            <thead><tr className="border-b border-outline-variant text-left text-on-surface-variant"><th className="py-1.5 font-semibold">Distance</th><th className="py-1.5 font-semibold">Standard</th><th className="py-1.5 font-semibold">Négocié</th></tr></thead>
            <tbody>
              {[2, 5, 10, 20].map((km) => (
                <tr key={km} className="border-b border-outline-variant last:border-0"><td className="py-1.5">{km} km</td><td className="py-1.5">{formatFcfa(standardPreview(km))}</td><td className="py-1.5 font-semibold">{formatFcfa(preview(km))}</td></tr>
              ))}
            </tbody>
          </table>

          {state.error && <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{state.error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" disabled={state.busy} className="flex-1">{state.busy ? 'Enregistrement…' : 'Enregistrer le tarif'}</Button>
            {user.custom_tariff && <Button type="button" variant="secondary" onClick={reset} disabled={state.busy} className="flex-1">Revenir au barème standard</Button>}
          </div>
        </form>
      )}
    </Sheet>
  );
}

function categoryOf(u) {
  if (u.role === 'client') return u.account_type === 'entreprise' ? 'Entreprise' : 'Particulier';
  return ROLE[u.role] ?? u.role;
}

// Tous les comptes : recherche, filtre par catégorie, activation et désactivation.
export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [tariffFor, setTariffFor] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, category, status]);

  useEffect(() => {
    const params = { page, q: term || undefined, status: status || undefined };
    if (category === 'particulier' || category === 'entreprise') {
      params.role = 'client';
      params.account_type = category;
    } else if (category) {
      params.role = category;
    }
    adminService.users(params).then((r) => { setResult(r); setError(''); }).catch(() => setError('Impossible de charger les utilisateurs.'));
  }, [page, term, category, status]);

  async function toggle(user) {
    const next = !user.is_active;
    if (!next && !window.confirm(`Désactiver le compte de ${user.first_name} ${user.last_name} ? Il sera déconnecté immédiatement.`)) return;
    setBusyId(user.id);
    try {
      await adminService.setUserActive(user.id, next);
      setResult((r) => ({ ...r, data: r.data.map((u) => (u.id === user.id ? { ...u, is_active: next } : u)) }));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, e-mail, téléphone, entreprise…" />
        <Select label="Catégorie" value={category} onChange={setCategory} options={[['', 'Toutes les catégories'], ['particulier', 'Particuliers'], ['entreprise', 'Entreprises'], ['livreur', 'Livreurs'], ['commercant', 'Commerçants']]} />
        <Select label="Statut" value={status} onChange={setStatus} options={[['', 'Tous les statuts'], ['active', 'Actifs'], ['inactive', 'Désactivés']]} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} compte{result.total > 1 ? 's' : ''}</span>}
      </div>

      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucun compte ne correspond.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {result.data.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-card ${u.is_active ? '' : 'opacity-60'}`}>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={u.avatar_url} name={u.first_name} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {u.company_name ? `${u.company_name} · ` : ''}{u.first_name} {u.last_name}
                  </p>
                  <p className="truncate text-sm text-on-surface-variant">{u.email} · {u.phone}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge tone="warn">{categoryOf(u)}</Badge>
                    {!u.email_verified_at && <Badge tone="bad">E-mail non vérifié</Badge>}
                    {!u.is_active && <Badge tone="bad">Désactivé</Badge>}
                    {u.custom_tariff && <Badge tone="ok">Tarif négocié</Badge>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
              {isCompanyOwner(u) && (
                <button type="button" onClick={() => setTariffFor(u)} className="rounded border border-secondary px-3 py-1.5 text-sm font-semibold text-secondary">
                  {u.custom_tariff ? 'Modifier le tarif' : 'Négocier un tarif'}
                </button>
              )}
              <button
                type="button"
                disabled={busyId === u.id}
                onClick={() => toggle(u)}
                className={`rounded border px-3 py-1.5 text-sm font-semibold ${u.is_active ? 'border-error text-error' : 'border-secondary text-secondary'}`}
              >
                {u.is_active ? 'Désactiver' : 'Réactiver'}
              </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={result?.current_page ?? 1} last={result?.last_page} onChange={setPage} />

      {tariffFor && (
        <TariffSheet
          user={tariffFor}
          onClose={() => setTariffFor(null)}
          onSaved={(tariff) => {
            setResult((r) => ({ ...r, data: r.data.map((u) => (u.id === tariffFor.id ? { ...u, custom_tariff: tariff } : u)) }));
            setTariffFor(null);
          }}
        />
      )}
    </div>
  );
}
