import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import clientOrderService from '../../services/clientOrderService';
import profileService from '../../services/profileService';
import FavoritesFirstOption from '../../components/client/FavoritesFirstOption';
import AddressField from '../../components/client/AddressField';
import PhotoField from '../../components/client/PhotoField';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatFcfa } from '../../lib/format';

const MAX_ROWS = 10;
let nextKey = 1;
const newRow = () => ({ key: nextKey++, recipientId: '', type: 'colis', packageType: '', photo: null, price: null });

// Envoi en lot (entreprises) : un point de départ, plusieurs destinataires du carnet, une livraison par ligne.
// Chaque ligne suit les règles d'une livraison normale (photo du colis, prix imposé selon la distance).
export default function BatchOrder() {
  const user = useAuthStore((s) => s.user);
  const [pickup, setPickup] = useState({ address: '', lat: null, lng: null, details: '' });
  const [rows, setRows] = useState([newRow()]);
  const [recipients, setRecipients] = useState(null);
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const [created, setCreated] = useState(null);
  const [favoritesFirst, setFavoritesFirst] = useState(false);
  const estimateCalls = useRef({});

  useEffect(() => {
    clientOrderService.listRecipients().then(setRecipients).catch(() => setRecipients([]));
    profileService.listAddresses().then(setSaved).catch(() => {});
  }, []);

  if (user && user.account_type !== 'entreprise') return <Navigate to="/client/commander" replace />;

  const located = pickup.lat !== null;
  const recipientOf = (row) => recipients?.find((r) => String(r.id) === String(row.recipientId));
  const patchRow = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Prix conseillé de la ligne : sert de valeur par défaut tant que l'entreprise n'a pas saisi le sien.
  async function estimate(row, recipient, from) {
    if (!from || !recipient) return;
    const call = (estimateCalls.current[row.key] = (estimateCalls.current[row.key] ?? 0) + 1);
    try {
      const result = await clientOrderService.estimate({
        pickupLat: from.lat, pickupLng: from.lng, dropoffLat: recipient.lat, dropoffLng: recipient.lng, urgency: 'standard',
      });
      if (estimateCalls.current[row.key] !== call) return;
      setRows((list) => list.map((r) => (r.key === row.key
        ? { ...r, price: result.estimated_price }
        : r)));
    } catch (err) {
      const msg = Object.values(err.response?.data?.errors ?? {})[0]?.[0];
      setRowErrors((e) => ({ ...e, [row.key]: msg ?? "Trajet impossible à estimer." }));
    }
  }

  function chooseRecipient(row, id) {
    setRowErrors((e) => ({ ...e, [row.key]: undefined }));
    patchRow(row.key, { recipientId: id, suggested: null });
    estimate(row, recipients.find((r) => String(r.id) === String(id)), located ? pickup : null);
  }

  function selectPickup(place) {
    const next = { ...pickup, ...place };
    setPickup(next);
    rows.forEach((row) => estimate(row, recipientOf(row), next));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setRowErrors({});

    const problems = {};
    rows.forEach((row) => {
      if (!row.recipientId) problems[row.key] = 'Choisissez un destinataire.';
      else if (row.type === 'colis' && !row.photo) problems[row.key] = 'Ajoutez une photo du colis.';
      else if (!row.price) problems[row.key] = 'Le prix de ce trajet n\'est pas encore calculé.';
    });
    if (!located) setError("Choisissez le point de départ dans la liste de suggestions pour le localiser.");
    if (Object.keys(problems).length || !located) {
      setRowErrors(problems);
      return;
    }

    setBusy(true);
    try {
      const orders = await clientOrderService.createBatch(pickup, rows.map((r) => ({ ...r, recipient: recipientOf(r) })), { favoritesFirst });
      setCreated(orders);
    } catch (err) {
      const errs = err.response?.data?.errors ?? {};
      const byRow = {};
      Object.entries(errs).forEach(([field, messages]) => {
        const m = field.match(/^orders\.(\d+)\./);
        if (m && rows[Number(m[1])]) byRow[rows[Number(m[1])].key] = messages[0];
      });
      setRowErrors(byRow);
      if (!Object.keys(byRow).length) {
        setError(Object.values(errs)[0]?.[0] ?? err.response?.data?.message ?? 'Envoi impossible. Aucune livraison n\'a été créée.');
      } else {
        setError("Certaines lignes sont à corriger. Aucune livraison n'a été créée.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold">{created.length} livraison{created.length > 1 ? 's' : ''} créée{created.length > 1 ? 's' : ''}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Les livreurs à proximité sont prévenus. Suivez chaque livraison depuis votre liste.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {created.map((o) => (
            <li key={o.id}>
              <Link to={`/client/suivi/${o.id}`} className="flex justify-between gap-3 rounded-lg bg-surface-container p-3 text-sm">
                <span className="font-semibold">#{o.reference} · {o.recipient_name}</span>
                <span>{formatFcfa(o.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-3">
          <Link to="/client/commandes" className="btn-primary">Mes livraisons</Link>
          <button type="button" className="btn-secondary" onClick={() => { setCreated(null); setRows([newRow()]); }}>Nouveau lot</button>
        </div>
      </Card>
    );
  }

  const total = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <div>
        <h1 className="font-display text-2xl font-bold">Envoi en lot</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Un point de départ, jusqu'à {MAX_ROWS} destinataires. Si une ligne est invalide, aucune livraison n'est créée.</p>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Point de départ</h2>
        <div className="mt-4">
          <AddressField
            label="Adresse d'enlèvement"
            value={pickup.address}
            located={located}
            onTextChange={(address) => setPickup({ ...pickup, address, lat: null, lng: null })}
            onSelect={selectPickup}
            savedAddresses={saved}
            placeholder="Ex. Entrepôt, Akpakpa, Cotonou"
          />
          <Input className="mt-2" value={pickup.details} onChange={(e) => setPickup({ ...pickup, details: e.target.value })} maxLength={255} aria-label="Repère du point de départ" placeholder="Repère facultatif" />
        </div>
      </Card>

      {recipients && recipients.length === 0 && (
        <p className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Votre carnet est vide. <Link to="/client/destinataires" className="font-semibold underline">Ajoutez d'abord vos destinataires</Link>.
        </p>
      )}

      {rows.map((row, i) => (
        <Card key={row.key}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Livraison {i + 1}</h2>
            {rows.length > 1 && (
              <button type="button" className="text-sm font-semibold text-error" onClick={() => setRows((l) => l.filter((r) => r.key !== row.key))}>Retirer</button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={`rcp-${row.key}`} className="mb-1.5 block text-sm font-semibold">Destinataire</label>
              <select id={`rcp-${row.key}`} className="input-field" value={row.recipientId} onChange={(e) => chooseRecipient(row, e.target.value)}>
                <option value="">Choisir dans mon carnet…</option>
                {(recipients ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.address}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`type-${row.key}`} className="mb-1.5 block text-sm font-semibold">Type</label>
              <select id={`type-${row.key}`} className="input-field" value={row.type} onChange={(e) => patchRow(row.key, { type: e.target.value })}>
                <option value="colis">Colis à livrer</option>
                <option value="course">Course (achats à faire)</option>
              </select>
            </div>
            <Input label="Contenu (facultatif)" maxLength={100} value={row.packageType} onChange={(e) => patchRow(row.key, { packageType: e.target.value })} />
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Prix</span>
              <p className="font-display text-2xl font-extrabold text-primary">{row.price ? formatFcfa(row.price) : '—'}</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {row.price ? 'Imposé selon la distance (tarif de votre entreprise), non négociable.' : 'Calculé une fois le destinataire choisi.'}
              </p>
            </div>
            <PhotoField
              file={row.photo}
              onChange={(photo) => patchRow(row.key, { photo })}
              required={row.type === 'colis'}
              filename={`colis-${i + 1}.jpg`}
            />
          </div>
          {rowErrors[row.key] && <p role="alert" className="mt-3 text-sm font-medium text-error">{rowErrors[row.key]}</p>}
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" disabled={rows.length >= MAX_ROWS} onClick={() => setRows((l) => [...l, newRow()])}>
          Ajouter un destinataire
        </Button>
        <p className="text-sm text-on-surface-variant">{rows.length} livraison{rows.length > 1 ? 's' : ''} · {formatFcfa(total)}</p>
      </div>

      <FavoritesFirstOption checked={favoritesFirst} onChange={setFavoritesFirst} />

      {error && <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
        {busy ? 'Envoi…' : `Lancer ${rows.length} livraison${rows.length > 1 ? 's' : ''}`}
      </Button>
    </form>
  );
}
