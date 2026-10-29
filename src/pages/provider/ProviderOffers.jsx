import { useCallback, useEffect, useState } from 'react';
import useAuthStore from '../../store/useAuthStore';
import serviceOffersService from '../../services/serviceOffersService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import { PROFESSION_LABEL } from '../../lib/professions';
import { formatFcfa } from '../../lib/format';

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// Espace du prestataire : statut du dossier tant qu'il n'est pas validé, puis les offres de prestation de son métier.
export default function ProviderOffers() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.bootstrap);
  const provider = user?.service_provider;
  const status = provider?.status;

  if (!provider) {
    return <Card><p className="text-sm text-on-surface-variant">Aucun dossier prestataire n'est rattaché à ce compte.</p></Card>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Bonjour, {user.first_name}</h1>
        <p className="text-sm text-on-surface-variant">
          {PROFESSION_LABEL[provider.profession] ?? provider.profession}
          {provider.profession === 'autre' && provider.profession_other ? ` : ${provider.profession_other}` : ''} · {provider.city}
        </p>
      </div>

      {status === 'approved' ? <Offers /> : <PendingCard status={status} reason={provider.rejection_reason} onRefresh={refreshUser} />}
    </div>
  );
}

function PendingCard({ status, reason, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const rejected = status === 'rejected';

  async function refresh() {
    setBusy(true);
    await onRefresh();
    setBusy(false);
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">{rejected ? 'Votre dossier a été refusé' : 'Votre dossier est en cours d\'examen'}</h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        {rejected
          ? `${reason ? `Motif : ${reason}. ` : ''}Contactez-nous si vous pensez qu'il s'agit d'une erreur.`
          : 'Notre équipe vérifie votre profil. Les offres de prestation de votre métier s\'afficheront ici dès la validation.'}
      </p>
      {!rejected && (
        <Button variant="secondary" onClick={refresh} disabled={busy} className="mt-4 w-full sm:w-auto">
          {busy ? 'Actualisation…' : 'Actualiser mon statut'}
        </Button>
      )}
    </Card>
  );
}

function Offers() {
  const [tab, setTab] = useState('offers');
  const [offers, setOffers] = useState(null);
  const [mine, setMine] = useState(null);
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    serviceOffersService.offers({ city: city || undefined }).then((r) => { setOffers(r.data); setError(''); }).catch(() => setError('Impossible de charger les offres.'));
    serviceOffersService.myOffers().then((r) => setMine(r.data)).catch(() => {});
  }, [city]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  async function accept(offer) {
    setBusyId(offer.id);
    setError('');
    try {
      await serviceOffersService.accept(offer.id);
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
        {[['offers', `Offres disponibles${offers ? ` (${offers.length})` : ''}`], ['mine', `Mes prestations${mine ? ` (${mine.length})` : ''}`]].map(([key, label]) => (
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
            <p className="mt-6 text-on-surface-variant">Aucune offre ouverte pour votre métier pour le moment. Revenez bientôt.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {offers.map((o) => (
                <li key={o.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
                  <p className="font-semibold">{o.title}</p>
                  <p className="mt-0.5 text-sm text-on-surface-variant">{o.city} · publiée le {fmtDate(o.created_at)} · par {o.client_name}</p>
                  <p className="mt-2 whitespace-pre-line text-sm">{o.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-primary">{o.budget ? formatFcfa(o.budget) : 'Budget à discuter'}</span>
                    <Button onClick={() => accept(o)} disabled={busyId === o.id}>{busyId === o.id ? '…' : 'Prendre cette offre'}</Button>
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
            <p className="mt-6 text-on-surface-variant">Vous n'avez pas encore pris d'offre.</p>
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
