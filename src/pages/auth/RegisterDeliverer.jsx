import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import delivererService from '../../services/delivererService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

const STEPS = ['Informations', 'Véhicule', 'Pièces justificatives'];

export default function RegisterDeliverer() {
  const { register, status, error } = useAuthStore();
  const [step, setStep] = useState(0);
  const [accountCreated, setAccountCreated] = useState(false);
  const [uploadWarning, setUploadWarning] = useState(false);
  const [form, setForm] = useState({
    role: 'livreur',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    vehicle_type: 'moto',
    vehicle_plate: '',
  });
  const [files, setFiles] = useState({ id_card: null, driving_license: null });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    const { vehicle_type, vehicle_plate, ...registerPayload } = form; // eslint-disable-line no-unused-vars
    try {
      await register(registerPayload);
      setAccountCreated(true);
      setStep(2);
    } catch {
      // erreur déjà affichée via le store
    }
  }

  async function handleUploadDocuments(e) {
    e.preventDefault();
    const formData = new FormData();
    if (files.id_card) formData.append('id_card', files.id_card);
    if (files.driving_license) formData.append('driving_license', files.driving_license);
    formData.append('vehicle_type', form.vehicle_type);
    formData.append('vehicle_plate', form.vehicle_plate);

    try {
      await delivererService.uploadDocument(formData);
    } catch {
      // Voir README > "Écarts backend connus" : aucune route d'upload n'est encore
      // exposée par le backend, l'échec ici est donc attendu tant qu'elle n'existe pas.
      setUploadWarning(true);
    }
  }

  if (accountCreated && step === 2) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <Card>
          <h1 className="font-display text-2xl font-bold">Dépôt des pièces justificatives</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Dernière étape : déposez votre pièce d'identité et votre permis pour que notre équipe valide votre
            compte livreur.
          </p>

          {uploadWarning && (
            <p className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
              Le service de dépôt de documents n'est pas encore disponible côté serveur. Votre compte a bien été
              créé — un membre de l'équipe LIV corp vous recontactera pour finaliser la vérification.
            </p>
          )}

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleUploadDocuments}>
            <FileField
              label="Pièce d'identité (CNI / passeport)"
              onChange={(f) => setFiles((s) => ({ ...s, id_card: f }))}
            />
            <FileField
              label="Permis de conduire"
              onChange={(f) => setFiles((s) => ({ ...s, driving_license: f }))}
            />
            <Button type="submit" className="mt-2 w-full">
              Envoyer mon dossier
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Vous pourrez toujours compléter ce dossier plus tard depuis votre tableau de bord.
          </p>
          <Link to="/connexion" className="btn-tertiary mt-2 block text-center">
            Aller à la connexion →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <h1 className="font-display text-2xl font-bold">Rejoindre la flotte LIV corp</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Générez des revenus à votre rythme.</p>

        <ol className="mt-6 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
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

        {error && <p className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

        {step === 0 && (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setStep(1);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Prénom"
                required
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
              />
              <Input
                label="Nom"
                required
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
              />
            </div>
            <Input
              label="E-mail"
              type="email"
              required
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
            <Input
              label="Téléphone"
              type="tel"
              placeholder="+229 …"
              required
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
            <Input
              label="Mot de passe"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
            />
            <Input
              label="Confirmer le mot de passe"
              type="password"
              required
              value={form.password_confirmation}
              onChange={(e) => update('password_confirmation', e.target.value)}
            />
            <Button type="submit" className="mt-2 w-full">
              Continuer
            </Button>
          </form>
        )}

        {step === 1 && (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleCreateAccount}>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Type de véhicule</span>
              <div className="flex gap-2">
                {['moto', 'velo', 'voiture'].map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => update('vehicle_type', type)}
                    className={`flex-1 rounded border px-3 py-2 text-sm font-semibold capitalize transition ${
                      form.vehicle_type === type
                        ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="Plaque d'immatriculation"
              required
              value={form.vehicle_plate}
              onChange={(e) => update('vehicle_plate', e.target.value)}
            />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setStep(0)} className="flex-1">
                Retour
              </Button>
              <Button type="submit" disabled={status === 'loading'} className="flex-1">
                {status === 'loading' ? 'Création…' : 'Créer mon compte'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function FileField({ label, onChange }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input
        type="file"
        accept="image/*,.pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full rounded border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm"
      />
    </div>
  );
}
