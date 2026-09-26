import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useOrderDraftStore from '../../store/useOrderDraftStore';
import clientOrderService from '../../services/clientOrderService';
import { reverseGeocode } from '../../lib/geocoding';
import { formatDuration, formatFcfa, formatKm } from '../../lib/format';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import AddressField from '../../components/client/AddressField';
import RouteMap from '../../components/client/RouteMap';
import PhotoField from '../../components/client/PhotoField';
import PhotoViewer from '../../components/common/PhotoViewer';

// Tunnel de commande client en trois étapes : trajet (adresses localisées sur une carte),
// colis et prix (photo, destinataire, prix fixé par le client), récapitulatif.
const STEPS = ['Trajet', 'Colis et prix', 'Récapitulatif'];
const STEP_OF_FIELD = {
  pickup_address: 0, pickup_lat: 0, pickup_lng: 0, dropoff_address: 0, dropoff_lat: 0, dropoff_lng: 0,
};

function firstError(err, fallback) {
  const errors = err.response?.data?.errors;
  return (errors && Object.values(errors)[0]?.[0]) ?? err.response?.data?.message ?? fallback;
}

export default function OrderTunnel() {
  const draft = useOrderDraftStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  // Un prix déjà présent dans le brouillon (retour en arrière) est considéré comme choisi par le client.
  const [priceTouched, setPriceTouched] = useState(draft.price !== '');
  const reverseCalls = useRef({ pickup: 0, dropoff: 0 });

  const pickup = draft.pickupLat != null ? { lat: draft.pickupLat, lng: draft.pickupLng } : null;
  const dropoff = draft.dropoffLat != null ? { lat: draft.dropoffLat, lng: draft.dropoffLng } : null;
  const estimate = draft.estimate;
  const suggested = estimate?.suggested_prices?.[draft.urgency];
  const minPrice = estimate?.min_price ?? 500;

  // Itinéraire recalculé dès que les deux points sont localisés ou déplacés.
  useEffect(() => {
    if (!pickup || !dropoff) {
      draft.setEstimate(null);
      return undefined;
    }
    let cancelled = false;
    setEstimating(true);
    setEstimateError('');
    const timer = setTimeout(async () => {
      try {
        const result = await clientOrderService.estimate({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          urgency: draft.urgency,
        });
        if (!cancelled) draft.setEstimate(result);
      } catch (err) {
        if (!cancelled) {
          draft.setEstimate(null);
          setEstimateError(firstError(err, "Impossible de calculer l'itinéraire. Réessayez."));
        }
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pickupLat, draft.pickupLng, draft.dropoffLat, draft.dropoffLng]);

  // Le prix conseillé pré-remplit le champ tant que le client ne l'a pas modifié lui-même.
  useEffect(() => {
    if (suggested && !priceTouched) draft.setField('price', suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, priceTouched]);

  function handleText(kind, text) {
    draft.setField(`${kind}Address`, text);
    draft.setField(`${kind}Lat`, null);
    draft.setField(`${kind}Lng`, null);
  }

  function handleSelect(kind, { address, lat, lng }) {
    draft.setField(`${kind}Address`, address);
    draft.setField(`${kind}Lat`, lat);
    draft.setField(`${kind}Lng`, lng);
    setFieldErrors((e) => ({ ...e, [`${kind}_address`]: undefined }));
  }

  // Repère placé ou glissé sur la carte : la position fait foi, le libellé suit.
  async function handleMove(kind, { lat, lng }) {
    draft.setField(`${kind}Lat`, lat);
    draft.setField(`${kind}Lng`, lng);
    const call = ++reverseCalls.current[kind];
    const label = await reverseGeocode(lat, lng);
    if (call === reverseCalls.current[kind]) draft.setField(`${kind}Address`, label);
  }

  function validateStep1() {
    const errors = {};
    if (draft.type === 'colis' && !draft.photo) errors.photo = 'Ajoutez une photo du colis.';
    if (!draft.recipientName.trim()) errors.recipient_name = 'Indiquez le nom du destinataire.';
    if (!draft.recipientPhone.trim()) errors.recipient_phone = 'Indiquez le téléphone du destinataire.';
    const price = Number(draft.price);
    if (!Number.isInteger(price) || price < minPrice) errors.price = `Le prix minimum est de ${formatFcfa(minPrice)}.`;
    return errors;
  }

  function goToStep1() {
    setError('');
    setStep(1);
  }

  function goToStep2() {
    const errors = validateStep1();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setError('');
    setStep(2);
  }

  async function handleConfirmOrder() {
    setCreating(true);
    setError('');
    try {
      const result = await clientOrderService.create(draft);
      setOrder(result.order);
    } catch (err) {
      const errors = err.response?.data?.errors ?? {};
      setFieldErrors(Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]])));
      setError(firstError(err, 'Impossible de créer la commande.'));
      // On renvoie le client à l'étape qui contient le champ refusé par le serveur.
      const failing = Object.keys(errors)[0];
      setStep(failing in STEP_OF_FIELD ? STEP_OF_FIELD[failing] : 1);
    } finally {
      setCreating(false);
    }
  }

  // Le paiement n'a pas lieu ici : le client règle à la réception du colis, devant le livreur,
  // depuis la page de suivi (cf. PaymentCard).
  function handleTrack() {
    draft.reset();
    navigate(`/client/suivi/${order.id}`);
  }

  const canContinue = Boolean(pickup && dropoff && estimate && !estimating);
  const price = Number(draft.price);
  const farBelowSuggestion = suggested && Number.isFinite(price) && price > 0 && price < suggested * 0.6;

  if (order) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="font-display text-xl font-bold">Commande confirmée</h1>
          {order.photo_url && (
            <div className="mt-4">
              <PhotoViewer src={order.photo_url} className="h-48 sm:h-64" />
              <p className="mt-1 text-xs text-on-surface-variant">Voici la photo que les livreurs voient.</p>
            </div>
          )}
          <p className="mt-3 text-sm text-on-surface-variant">
            Commande <strong>#{order.reference}</strong> créée. Les livreurs voient votre photo et votre prix : l'un
            d'eux va l'accepter ou vous proposer un autre montant, que vous êtes libre d'accepter ou non.
          </p>
          <p className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            Rien à payer maintenant : vous réglerez <strong>{formatFcfa(order.price)}</strong> à la réception du colis,
            devant le livreur (Mobile Money, carte ou espèces).
          </p>
          <Button onClick={handleTrack} className="mt-6 w-full">
            Suivre ma commande
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 ${i <= step ? 'text-primary' : ''}`}>
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                i <= step ? 'bg-primary text-on-primary' : 'bg-surface-container-high'
              }`}
            >
              {i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 flex-shrink-0 bg-outline-variant sm:w-6" />}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mb-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      {/* ---------------------------------------------------------------- Étape 1 : trajet */}
      {step === 0 && (
        <Card>
          <h1 className="font-display text-xl font-bold">Où récupérer, où livrer ?</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Choisissez chaque adresse dans la liste, ou placez le repère sur la carte : c'est cette position exacte que
            le livreur suivra.
          </p>

          <div className="mt-5 flex flex-col gap-4">
            <div className="flex gap-2">
              {[
                { value: 'colis', label: 'Envoyer un colis' },
                { value: 'course', label: 'Faire une course' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => draft.setField('type', opt.value)}
                  aria-pressed={draft.type === opt.value}
                  className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${
                    draft.type === opt.value
                      ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <AddressField
                label="Point de départ (A)"
                value={draft.pickupAddress}
                located={Boolean(pickup)}
                onTextChange={(text) => handleText('pickup', text)}
                onSelect={(place) => handleSelect('pickup', place)}
                placeholder="Ex. Marché Dantokpa, Cotonou"
                error={fieldErrors.pickup_address}
              />
              <Input
                className="mt-2"
                value={draft.pickupDetails}
                onChange={(e) => draft.setField('pickupDetails', e.target.value)}
                placeholder="Repère facultatif : portail bleu, en face de la pharmacie…"
                aria-label="Repère du point de départ"
                maxLength={255}
              />
            </div>

            <div>
              <AddressField
                label="Destination (B)"
                value={draft.dropoffAddress}
                located={Boolean(dropoff)}
                onTextChange={(text) => handleText('dropoff', text)}
                onSelect={(place) => handleSelect('dropoff', place)}
                placeholder="Ex. Fidjrossè, Cotonou"
                near={pickup ?? undefined}
                error={fieldErrors.dropoff_address}
              />
              <Input
                className="mt-2"
                value={draft.dropoffDetails}
                onChange={(e) => draft.setField('dropoffDetails', e.target.value)}
                placeholder="Repère facultatif : 2e maison après le carrefour…"
                aria-label="Repère de la destination"
                maxLength={255}
              />
            </div>

            <RouteMap pickup={pickup} dropoff={dropoff} route={estimate?.route} onMove={handleMove} />

            {estimating && <p className="text-sm text-on-surface-variant">Calcul de l'itinéraire…</p>}
            {estimateError && (
              <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
                {estimateError}
              </p>
            )}
            {estimate && !estimating && (
              <div className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
                <strong>{formatKm(estimate.distance_km)}</strong> par la route, environ{' '}
                <strong>{formatDuration(estimate.duration_min)}</strong>.
                {estimate.distance_source === 'approx' && (
                  <span className="mt-1 block text-xs">
                    Distance approchée : le service d'itinéraires est momentanément indisponible.
                  </span>
                )}
              </div>
            )}

            <Button onClick={goToStep1} disabled={!canContinue} className="w-full">
              Continuer
            </Button>
          </div>
        </Card>
      )}

      {/* --------------------------------------------------------- Étape 2 : colis et prix */}
      {step === 1 && estimate && (
        <Card>
          <h1 className="font-display text-xl font-bold">{draft.type === 'colis' ? 'Votre colis' : 'Votre course'}</h1>

          <div className="mt-5 flex flex-col gap-4">
            <PhotoField
              file={draft.photo}
              onChange={(file) => {
                draft.setField('photo', file);
                setFieldErrors((e) => ({ ...e, photo: undefined }));
              }}
              required={draft.type === 'colis'}
              error={fieldErrors.photo}
            />

            <Input
              label="Description (facultatif)"
              value={draft.packageType}
              onChange={(e) => draft.setField('packageType', e.target.value)}
              placeholder={draft.type === 'colis' ? 'Ex. Carton de vêtements, fragile' : "Ex. Acheter 2 kg de riz et de l'huile"}
              maxLength={100}
            />

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Input
                label="Nom du destinataire"
                required
                value={draft.recipientName}
                onChange={(e) => {
                  draft.setField('recipientName', e.target.value);
                  setFieldErrors((errs) => ({ ...errs, recipient_name: undefined }));
                }}
                placeholder="Ex. Amina Doe"
                error={fieldErrors.recipient_name}
              />
              <Input
                label="Téléphone du destinataire"
                type="tel"
                required
                value={draft.recipientPhone}
                onChange={(e) => {
                  draft.setField('recipientPhone', e.target.value);
                  setFieldErrors((errs) => ({ ...errs, recipient_phone: undefined }));
                }}
                placeholder="+229 …"
                error={fieldErrors.recipient_phone}
              />
            </div>

            <div>
              <label htmlFor="instructions" className="mb-1.5 block text-sm font-semibold">
                Instructions pour le livreur (facultatif)
              </label>
              <textarea
                id="instructions"
                rows={2}
                maxLength={500}
                className="textarea-field"
                value={draft.instructions}
                onChange={(e) => draft.setField('instructions', e.target.value)}
                placeholder="Précautions, horaires… Le code du portail se donne au livreur une fois la course acceptée."
              />
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold">Urgence</span>
              <div className="flex gap-2">
                {[
                  { value: 'standard', label: 'Standard' },
                  { value: 'express', label: 'Express (prioritaire)' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => draft.setField('urgency', opt.value)}
                    aria-pressed={draft.urgency === opt.value}
                    className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${
                      draft.urgency === opt.value
                        ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-outline-variant p-4">
              <Input
                label="Votre prix (FCFA)"
                name="price"
                type="number"
                inputMode="numeric"
                min={minPrice}
                step="50"
                required
                value={draft.price}
                onChange={(e) => {
                  setPriceTouched(true);
                  draft.setField('price', e.target.value === '' ? '' : Number(e.target.value));
                  setFieldErrors((errs) => ({ ...errs, price: undefined }));
                }}
                error={fieldErrors.price}
              />
              <p className="mt-2 text-sm text-on-surface-variant">
                Prix conseillé pour {formatKm(estimate.distance_km)} :{' '}
                <strong className="text-on-surface">{formatFcfa(suggested)}</strong>
                {Number(draft.price) !== suggested && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="font-semibold text-secondary underline"
                      onClick={() => {
                        setPriceTouched(false);
                        draft.setField('price', suggested);
                      }}
                    >
                      Utiliser
                    </button>
                  </>
                )}
              </p>
              {farBelowSuggestion && (
                <p className="mt-2 rounded bg-primary-fixed px-3 py-2 text-xs text-on-primary-fixed-variant">
                  Ce prix est bien en dessous du conseillé : moins de livreurs l'accepteront rapidement.
                </p>
              )}
              <p className="mt-2 text-xs text-on-surface-variant">
                C'est vous qui fixez le prix. Un livreur peut vous proposer un autre montant : vous décidez de
                l'accepter ou non.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
                Retour
              </Button>
              <Button onClick={goToStep2} className="flex-1">
                Continuer
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------------- Étape 3 : récapitulatif */}
      {step === 2 && estimate && (
        <Card>
          <h1 className="font-display text-xl font-bold">Récapitulatif</h1>

          {draft.photo && <PhotoPreview file={draft.photo} />}

          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Prix fixé" value={formatFcfa(draft.price)} highlight />
            <Row label="Prix conseillé" value={formatFcfa(suggested)} />
            <Row
              label="Trajet"
              value={`${formatKm(estimate.distance_km)} · ${formatDuration(estimate.duration_min)}`}
            />
            <Row label="De (A)" value={[draft.pickupAddress, draft.pickupDetails].filter(Boolean).join(' · ')} />
            <Row label="À (B)" value={[draft.dropoffAddress, draft.dropoffDetails].filter(Boolean).join(' · ')} />
            <Row label="Destinataire" value={`${draft.recipientName} · ${draft.recipientPhone}`} />
            <Row label="Urgence" value={draft.urgency === 'express' ? 'Express' : 'Standard'} />
            <Row label="Paiement" value="À la réception, devant le livreur" />
          </dl>

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={creating} className="flex-1">
              Modifier
            </Button>
            <Button onClick={handleConfirmOrder} disabled={creating} className="flex-1">
              {creating ? 'Envoi…' : 'Confirmer la commande'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// Aperçu du fichier local ; l'URL d'objet est créée une fois et libérée au démontage.
function PhotoPreview({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url ? <img src={url} alt="Photo du colis" className="mt-4 h-40 w-full rounded-lg object-cover sm:h-56" /> : null;
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-3">
      <dt className="flex-shrink-0 text-on-surface-variant">{label}</dt>
      <dd
        className={`break-words text-right ${highlight ? 'font-display text-lg font-bold text-primary' : 'font-medium'}`}
      >
        {value}
      </dd>
    </div>
  );
}
