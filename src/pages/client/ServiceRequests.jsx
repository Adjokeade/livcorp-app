import { useEffect, useState } from 'react';
import serviceOffersService from '../../services/serviceOffersService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import { PROFESSION_LABEL, PROFESSION_OPTIONS } from '../../lib/professions';
import { formatFcfa } from '../../lib/format';

const EMPTY = { profession: '', title: '', description: '', city: '', address: '', budget: '' };
const STATUS = { open: 'Ouverte', taken: 'Prise en charge', cancelled: 'Annulée' };

// Le client publie une offre de prestation (plombier, coiffeuse…) ; un prestataire validé du bon métier la prend.
export default function ServiceRequests() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: '', fields: {} });

  const load = () => serviceOffersService.requests().then((r) => setList(r.data)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: '', fields: {} });
    try {
      await serviceOffersService.createRequest({ ...form, budget: form.budget === '' ? null : Number(form.budget), address: form.address || null });
      setForm(EMPTY);
      setState({ busy: false, error: '', fields: {} });
      load();
    } catch (err) {
      setState({ busy: false, error: err.response?.data?.message ?? 'Publication impossible.', fields: err.response?.data?.errors ?? {} });
    }
  }

  async function cancel(id) {
    if (!window.confirm('Annuler cette demande ?')) return;
    try {
      await serviceOffersService.cancelRequest(id);
      load();
    } catch (err) {
      setState((s) => ({ ...s, error: err.response?.data?.message ?? 'Annulation impossible.' }));
    }
  }

  const { fields } = state;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Demander un service</h1>

      <Card>
        <h2 className="font-display text-lg font-bold">Publier une offre de prestation</h2>
        <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit}>
          {state.error && <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container sm:col-span-2">{state.error}</p>}
          <div>
            <label htmlFor="sr-profession" className="mb-1.5 block text-sm font-semibold">Métier recherché</label>
            <select id="sr-profession" required className="input-field" value={form.profession} onChange={set('profession')}>
              <option value="" disabled>Choisir un métier</option>
              {PROFESSION_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {fields.profession?.[0] && <p className="mt-1 text-xs font-medium text-error">{fields.profession[0]}</p>}
          </div>
          <Input label="Titre" name="title" required value={form.title} onChange={set('title')} placeholder="Fuite sous l'évier" error={fields.title?.[0]} />
          <Input label="Ville" name="city" required value={form.city} onChange={set('city')} error={fields.city?.[0]} />
          <Input label="Quartier / adresse (facultatif)" name="address" value={form.address} onChange={set('address')} hint="Visible seulement du prestataire qui prend l'offre." error={fields.address?.[0]} />
          <Input label="Budget en FCFA (facultatif)" type="number" min="0" name="budget" value={form.budget} onChange={set('budget')} error={fields.budget?.[0]} />
          <div className="sm:col-span-2">
            <label htmlFor="sr-description" className="mb-1.5 block text-sm font-semibold">Description</label>
            <textarea id="sr-description" required minLength={10} maxLength={1500} rows={4} className="input-field" value={form.description} onChange={set('description')} placeholder="Décrivez le besoin, l'urgence, vos disponibilités…" />
            {fields.description?.[0] && <p className="mt-1 text-xs font-medium text-error">{fields.description[0]}</p>}
          </div>
          <Button type="submit" disabled={state.busy} className="sm:col-span-2">{state.busy ? 'Publication…' : 'Publier l\'offre'}</Button>
        </form>
      </Card>

      <div>
        <h2 className="font-display text-lg font-bold">Mes demandes</h2>
        {!list ? (
          <div className="mt-4 flex justify-center"><Spinner className="h-6 w-6" /></div>
        ) : list.length === 0 ? (
          <p className="mt-3 text-on-surface-variant">Aucune demande pour le moment.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((r) => (
              <li key={r.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.title}</p>
                  <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold">{STATUS[r.status] ?? r.status}</span>
                </div>
                <p className="mt-0.5 text-sm text-on-surface-variant">{PROFESSION_LABEL[r.profession] ?? r.profession} · {r.city}{r.budget ? ` · ${formatFcfa(r.budget)}` : ''}</p>
                {r.status === 'taken' && r.provider && (
                  <p className="mt-2 text-sm">
                    Prestataire : <span className="font-semibold">{r.provider.first_name} {r.provider.last_name}</span> ·{' '}
                    <a href={`tel:${r.provider.phone}`} className="font-semibold text-secondary">{r.provider.phone}</a>
                  </p>
                )}
                {r.status === 'open' && (
                  <button type="button" onClick={() => cancel(r.id)} className="mt-3 rounded border border-error px-3 py-1.5 text-sm font-semibold text-error">Annuler</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
