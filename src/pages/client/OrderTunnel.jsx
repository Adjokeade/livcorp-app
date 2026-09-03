import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useOrderDraftStore from '../../store/useOrderDraftStore';
import clientOrderService from '../../services/clientOrderService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

// Tunnel de commande client — converti de commander_tunnel_client/code.html.
// Géocodage via Nominatim (OpenStreetMap), cohérent avec MAPS_PROVIDER=osm côté backend.
async function geocode(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bj&q=${encodeURIComponent(query)}`,
  );
  const results = await res.json();
  if (!results.length) throw new Error('Adresse introuvable.');
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), label: results[0].display_name };
}

const STEPS = ['Adresses', 'Estimation', 'Paiement'];

export default function OrderTunnel() {
  const draft = useOrderDraftStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [geocoding, setGeocoding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);

  async function handleAddressesSubmit(e) {
    e.preventDefault();
    setError('');
    setGeocoding(true);
    try {
      const [pickup, dropoff] = await Promise.all([
        geocode(draft.pickupAddress),
        geocode(draft.dropoffAddress),
      ]);
      draft.setField('pickupLat', pickup.lat);
      draft.setField('pickupLng', pickup.lng);
      draft.setField('dropoffLat', dropoff.lat);
      draft.setField('dropoffLng', dropoff.lng);

      const estimate = await clientOrderService.estimate({
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        urgency: draft.urgency,
      });
      draft.setEstimate(estimate);
      setStep(1);
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Impossible d'estimer le trajet.");
    } finally {
      setGeocoding(false);
    }
  }

  async function handleConfirmOrder() {
    setCreating(true);
    setError('');
    try {
      const result = await clientOrderService.create(draft);
      setOrder(result.order);
      setPayment(result.payment);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Impossible de créer la commande.');
    } finally {
      setCreating(false);
    }
  }

  // Ouvre le widget FedaPay Checkout.js. La clé secrète ne quitte jamais le backend :
  // seule la clé PUBLIQUE et l'id de transaction (créée côté serveur) sont utilisés ici,
  // conformément à l'exigence sécurité du prompt frontend.
  function handlePay() {
    if (!window.FedaPay) {
      setError('Le widget de paiement FedaPay ne s\'est pas chargé. Vérifiez votre connexion.');
      return;
    }
    window.FedaPay.init({
      public_key: import.meta.env.VITE_FEDAPAY_PUBLIC_KEY,
      transaction: {
        id: payment?.fedapay_transaction_id,
        amount: Number(order.price),
        description: `Commande LIV corp #${order.reference}`,
      },
      onComplete(response) {
        if (response.reason === window.FedaPay.CHECKOUT_COMPLETED) {
          draft.reset();
          navigate(`/client/suivi/${order.id}`);
        }
      },
    }).open();
  }

  return (
    <div className="mx-auto max-w-xl">
      <ol className="mb-6 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 ${i <= step ? 'text-primary' : ''}`}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                i <= step ? 'bg-primary text-on-primary' : 'bg-surface-container-high'
              }`}
            >
              {i + 1}
            </span>
            {label}
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-outline-variant" />}
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {step === 0 && (
        <Card>
          <h1 className="font-display text-xl font-bold">Où récupérer, où livrer ?</h1>
          <form className="mt-5 flex flex-col gap-4" onSubmit={handleAddressesSubmit}>
            <div className="flex gap-2">
              {[
                { value: 'colis', label: '📦 Envoyer un colis' },
                { value: 'course', label: '🛒 Faire une course' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => draft.setField('type', opt.value)}
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

            <Input
              label="Adresse de collecte"
              required
              value={draft.pickupAddress}
              onChange={(e) => draft.setField('pickupAddress', e.target.value)}
              placeholder="Ex. Marché Dantokpa, Cotonou"
            />
            <Input
              label="Adresse de livraison"
              required
              value={draft.dropoffAddress}
              onChange={(e) => draft.setField('dropoffAddress', e.target.value)}
              placeholder="Ex. Rue 245, Akpakpa"
            />
            <Input
              label="Type de colis (optionnel)"
              value={draft.packageType}
              onChange={(e) => draft.setField('packageType', e.target.value)}
            />
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Urgence</span>
              <div className="flex gap-2">
                {[
                  { value: 'standard', label: 'Standard' },
                  { value: 'express', label: 'Express' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => draft.setField('urgency', opt.value)}
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

            <Button type="submit" disabled={geocoding} className="mt-2 w-full">
              {geocoding ? 'Calcul en cours…' : 'Estimer le prix'}
            </Button>
          </form>
        </Card>
      )}

      {step === 1 && draft.estimate && (
        <Card>
          <h1 className="font-display text-xl font-bold">Récapitulatif</h1>
          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Distance estimée" value={`${draft.estimate.distance_km} km`} />
            <Row label="Prix estimé" value={`${draft.estimate.estimated_price} FCFA`} highlight />
            <Row label="De" value={draft.pickupAddress} />
            <Row label="À" value={draft.dropoffAddress} />
            <Row label="Urgence" value={draft.urgency === 'express' ? 'Express' : 'Standard'} />
          </dl>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
              Modifier
            </Button>
            <Button onClick={handleConfirmOrder} disabled={creating} className="flex-1">
              {creating ? 'Création…' : 'Confirmer la commande'}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && order && (
        <Card>
          <h1 className="font-display text-xl font-bold">Un dernier pas 🎉</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Commande <strong>#{order.reference}</strong> créée. Réglez en toute sécurité pour qu'un livreur se
            mette en route.
          </p>
          <Button onClick={handlePay} className="mt-6 w-full">
            Payer {order.price} FCFA avec FedaPay
          </Button>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant pb-3">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className={highlight ? 'font-display text-lg font-bold text-primary' : 'font-medium'}>{value}</dd>
    </div>
  );
}
