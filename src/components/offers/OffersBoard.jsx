import { useCallback, useEffect, useState } from 'react';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { formatFcfa } from '../../lib/format';

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// Tableau des offres ouvertes et des offres prises, commun aux prestataires et aux conciergeries.
// `api` : { offers, mine, accept } et `label` : nom donné à une offre (« offre », « mission »).
export default function OffersBoard({ api, noun = 'offre', emptyText }) {
  const [tab, setTab] = useState('offers');
  const [offers, setOffers] = useState(null);
  const [mine, setMine] = useState(null);
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.offers({ city: city || undefined }).then((r) => { setOffers(r.data); setError(''); }).catch(() => setError('Impossible de charger les offres.'));
    api.mine().then((r) => setMine(r.data)).catch(() => {});
  }, [city, api]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  async function accept(offer) {
    setBusyId(offer.id);
    setError('');
    try {
      await api.accept(offer.id);
      setTab('mine');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Action impossible.');
    } finally {
      setBusyId(null);
      load();
    }
  }

  return (
    <div>
      <div role="group" aria-label="Affichage" className="inline-flex rounded-lg border border-outline-variant p-0.5">
        {[['offers', `${noun === 'mission' ? 'Missions' : 'Offres'} disponibles${offers ? ` (${offers.length})` : ''}`], ['mine', `Mes ${noun === 'mission' ? 'missions' : 'prestations'}${mine ? ` (${mine.length})` : ''}`]].map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === key ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {tab === 'offers' && (
        <div className="mt-4">
          <input type="search" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Filtrer par ville" aria-label="Filtrer par ville" className="input-field sm:max-w-xs" />
          {!offers ? (
            <div className="mt-6 flex justify-center"><Spinner className="h-6 w-6" /></div>
          ) : offers.length === 0 ? (
            <p className="mt-6 text-on-surface-variant">{emptyText}</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {offers.map((o) => (
                <li key={o.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                  <p className="font-semibold">{o.title}</p>
                  <p className="mt-0.5 text-sm text-on-surface-variant">{o.city} · publiée le {fmtDate(o.created_at)} · par {o.client_name}</p>
                  <p className="mt-2 whitespace-pre-line text-sm">{o.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-primary">{o.budget ? formatFcfa(o.budget) : 'Budget à discuter'}</span>
                    <Button onClick={() => accept(o)} disabled={busyId === o.id}>{busyId === o.id ? '…' : `Prendre cette ${noun}`}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="mt-4">
          {!mine ? (
            <div className="mt-6 flex justify-center"><Spinner className="h-6 w-6" /></div>
          ) : mine.length === 0 ? (
            <p className="mt-6 text-on-surface-variant">Vous n'avez encore rien pris pour le moment.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {mine.map((o) => (
                <li key={o.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                  <p className="font-semibold">{o.title}</p>
                  <p className="mt-0.5 text-sm text-on-surface-variant">{o.city}{o.address ? `, ${o.address}` : ''}</p>
                  <p className="mt-2 whitespace-pre-line text-sm">{o.description}</p>
                  <p className="mt-3 text-sm">
                    Client : <span className="font-semibold">{o.client_name}</span> ·{' '}
                    <a href={`tel:${o.client_phone}`} className="font-semibold text-secondary">{o.client_phone}</a>
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary">{o.budget ? formatFcfa(o.budget) : 'Budget à discuter'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
