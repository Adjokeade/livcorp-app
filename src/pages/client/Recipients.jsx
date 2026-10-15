import { useEffect, useState } from 'react';
import clientOrderService from '../../services/clientOrderService';
import AddressField from '../../components/client/AddressField';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';

const EMPTY = { name: '', phone: '', address: '', lat: null, lng: null, details: '' };

// Carnet de destinataires : ils se choisissent ensuite en un geste pour une livraison ou un envoi en lot.
export default function Recipients() {
  const [recipients, setRecipients] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: '', fields: {} });

  useEffect(() => {
    clientOrderService.listRecipients().then(setRecipients).catch(() => setRecipients([]));
  }, []);

  const located = draft.lat !== null && draft.lng !== null;
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  async function add(e) {
    e.preventDefault();
    if (!located) {
      setState({ busy: false, fields: {}, error: "Choisissez l'adresse dans la liste de suggestions pour la localiser." });
      return;
    }
    setState({ busy: true, error: '', fields: {} });
    try {
      const created = await clientOrderService.createRecipient(draft);
      setRecipients((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(EMPTY);
      setState({ busy: false, error: '', fields: {} });
    } catch (err) {
      const raw = err.response?.data?.errors ?? {};
      setState({
        busy: false,
        fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]])),
        error: Object.keys(raw).length ? '' : (err.response?.data?.message ?? 'Enregistrement impossible.'),
      });
    }
  }

  async function remove(id) {
    await clientOrderService.deleteRecipient(id);
    setRecipients((list) => list.filter((r) => r.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mes destinataires</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Enregistrez vos destinataires habituels : plus besoin de ressaisir leur nom, téléphone et adresse.</p>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Ajouter un destinataire</h2>
        <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={add}>
          <Input label="Nom" required maxLength={150} value={draft.name} onChange={set('name')} error={state.fields.name} />
          <Input label="Téléphone" type="tel" required maxLength={20} value={draft.phone} onChange={set('phone')} error={state.fields.phone} />
          <div className="sm:col-span-2">
            <AddressField
              label="Adresse"
              value={draft.address}
              located={located}
              onTextChange={(address) => setDraft({ ...draft, address, lat: null, lng: null })}
              onSelect={({ address, lat, lng }) => setDraft({ ...draft, address, lat, lng })}
              placeholder="Ex. Fidjrossè, Cotonou"
              error={state.fields.address ?? state.fields.lat}
            />
          </div>
          <Input className="sm:col-span-2" label="Repère (facultatif)" maxLength={255} value={draft.details} onChange={set('details')} placeholder="Portail bleu, en face de la pharmacie…" />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={state.busy}>{state.busy ? 'Ajout…' : 'Ajouter'}</Button>
            {state.error && <span role="alert" className="text-sm font-medium text-error">{state.error}</span>}
          </div>
        </form>
      </Card>

      {recipients === null ? (
        <div className="flex justify-center py-8"><Spinner className="h-8 w-8" /></div>
      ) : recipients.length === 0 ? (
        <p className="text-center text-sm text-on-surface-variant">Aucun destinataire enregistré pour le moment.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recipients.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-card">
              <div className="min-w-0">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-on-surface-variant">{r.phone}</p>
                <p className="text-sm text-on-surface-variant">{r.address}</p>
                {r.details && <p className="text-xs text-on-surface-variant">{r.details}</p>}
              </div>
              <button type="button" onClick={() => remove(r.id)} className="shrink-0 text-sm font-semibold text-error" aria-label={`Supprimer ${r.name}`}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
