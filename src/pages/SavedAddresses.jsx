import { useEffect, useState } from 'react';
import profileService from '../services/profileService';
import AddressField from '../components/client/AddressField';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';

const SUGGESTED_LABELS = ['Domicile', 'Bureau', 'Entrepôt'];
const EMPTY = { label: '', address: '', lat: null, lng: null };

// Adresses enregistrées : toujours localisées, proposées ensuite dans le formulaire de livraison.
export default function SavedAddresses() {
  const [addresses, setAddresses] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: '' });

  useEffect(() => {
    profileService.listAddresses().then(setAddresses).catch(() => setAddresses([]));
  }, []);

  const located = draft.lat !== null && draft.lng !== null;

  async function add(e) {
    e.preventDefault();
    if (!located) {
      setState({ busy: false, error: "Choisissez l'adresse dans la liste de suggestions pour la localiser." });
      return;
    }
    setState({ busy: true, error: '' });
    try {
      const created = await profileService.createAddress(draft);
      setAddresses((list) => [...list, created].sort((a, b) => a.label.localeCompare(b.label)));
      setDraft(EMPTY);
      setState({ busy: false, error: '' });
    } catch (err) {
      const first = Object.values(err.response?.data?.errors ?? {})[0]?.[0];
      setState({ busy: false, error: first ?? err.response?.data?.message ?? 'Enregistrement impossible.' });
    }
  }

  async function remove(id) {
    await profileService.deleteAddress(id);
    setAddresses((list) => list.filter((a) => a.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mes adresses</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Enregistrez vos lieux habituels pour les choisir en un geste lors d'une livraison.</p>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Ajouter une adresse</h2>
        <form className="mt-4 flex flex-col gap-4" onSubmit={add}>
          <div>
            <Input label="Nom du lieu" required maxLength={60} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ex. Domicile" />
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTED_LABELS.map((label) => (
                <button type="button" key={label} onClick={() => setDraft({ ...draft, label })} className="rounded-full border border-outline-variant px-3 py-1 text-xs font-semibold text-on-surface-variant">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <AddressField
            label="Adresse"
            value={draft.address}
            located={located}
            onTextChange={(address) => setDraft({ ...draft, address, lat: null, lng: null })}
            onSelect={({ address, lat, lng }) => setDraft({ ...draft, address, lat, lng })}
            placeholder="Ex. Fidjrossè, Cotonou"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={state.busy}>{state.busy ? 'Ajout…' : 'Ajouter'}</Button>
            {state.error && <span role="alert" className="text-sm font-medium text-error">{state.error}</span>}
          </div>
        </form>
      </Card>

      {addresses === null ? (
        <div className="flex justify-center py-8"><Spinner className="h-8 w-8" /></div>
      ) : addresses.length === 0 ? (
        <p className="text-center text-sm text-on-surface-variant">Aucune adresse enregistrée pour le moment.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-card">
              <div className="min-w-0">
                <p className="font-semibold">{a.label}</p>
                <p className="text-sm text-on-surface-variant">{a.address}</p>
              </div>
              <button type="button" onClick={() => remove(a.id)} className="shrink-0 text-sm font-semibold text-error" aria-label={`Supprimer ${a.label}`}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
