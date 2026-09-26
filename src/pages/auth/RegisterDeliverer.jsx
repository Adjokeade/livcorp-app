import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DocumentsUpload from '../../components/deliverer/DocumentsUpload';
import { ROLE_HOME } from '../../lib/roleHome';

const STEPS = ['Informations', 'Véhicule', 'Pièces justificatives'];
const IDENTITY_FIELDS = ['first_name', 'last_name', 'sex', 'address', 'email', 'phone', 'emergency_phone', 'password'];
const PASSWORD_HINT = '8 caractères minimum, avec une majuscule, une minuscule et un chiffre.';

export default function RegisterDeliverer() {
  const navigate = useNavigate();
  const { register, status, error, clearError } = useAuthStore();
  const [step, setStep] = useState(0);
  const [documentsSent, setDocumentsSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    role: 'livreur',
    first_name: '',
    last_name: '',
    sex: '',
    address: '',
    email: '',
    phone: '',
    emergency_phone: '',
    password: '',
    password_confirmation: '',
    vehicle_type: 'moto',
    vehicle_plate: '',
  });

  // Une erreur restée dans le store depuis une autre page (connexion…) ne doit pas s'afficher ici.
  useEffect(() => {
    clearError();
  }, [clearError]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((errs) => {
      if (!errs[field]) return errs;
      const next = { ...errs };
      delete next[field];
      return next;
    });
  }

  function handleIdentity(e) {
    e.preventDefault();
    if (!form.sex) {
      setFieldErrors({ sex: ['Choisissez Homme ou Femme.'] });
      return;
    }
    if (form.password !== form.password_confirmation) {
      setFieldErrors({ password_confirmation: ['Les deux mots de passe ne correspondent pas.'] });
      return;
    }
    setFieldErrors({});
    setStep(1);
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    setFieldErrors({});
    try {
      // Le compte est créé puis connecté d'office : l'envoi des pièces à l'étape
      // suivante s'appuie sur cette session.
      const { user } = await register(form);
      if (!user) {
        navigate('/connexion', { replace: true });
        return;
      }
      setStep(2);
    } catch (err) {
      const errors = err.response?.data?.errors ?? {};
      setFieldErrors(errors);
      // Une erreur sur l'identité (e-mail déjà pris…) se corrige à la première étape.
      if (IDENTITY_FIELDS.some((f) => errors[f])) setStep(0);
    }
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <h1 className="font-display text-2xl font-bold">Rejoindre la flotte LIV corp</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Générez des revenus à votre rythme.</p>

        <ol className="mt-6 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
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

        {error && !hasFieldErrors && (
          <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}

        {step === 0 && (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleIdentity}>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Input
                label="Prénom"
                name="first_name"
                autoComplete="given-name"
                required
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
                error={fieldErrors.first_name?.[0]}
              />
              <Input
                label="Nom"
                name="last_name"
                autoComplete="family-name"
                required
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
                error={fieldErrors.last_name?.[0]}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Sexe</span>
              <div className="flex gap-2">
                {[
                  { value: 'homme', label: 'Homme' },
                  { value: 'femme', label: 'Femme' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => update('sex', opt.value)}
                    aria-pressed={form.sex === opt.value}
                    className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${
                      form.sex === opt.value
                        ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {fieldErrors.sex?.[0] && <p className="mt-1 text-xs font-medium text-error">{fieldErrors.sex[0]}</p>}
            </div>
            <Input
              label="Adresse"
              name="address"
              autoComplete="street-address"
              required
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="Quartier, ville"
              error={fieldErrors.address?.[0]}
            />
            <Input
              label="E-mail"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              error={fieldErrors.email?.[0]}
            />
            <Input
              label="Téléphone"
              type="tel"
              name="phone"
              autoComplete="tel"
              placeholder="+229 …"
              required
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              error={fieldErrors.phone?.[0]}
            />
            <Input
              label="Numéro d'urgence"
              type="tel"
              name="emergency_phone"
              placeholder="+229 …"
              hint="Un proche à prévenir en cas de besoin."
              required
              value={form.emergency_phone}
              onChange={(e) => update('emergency_phone', e.target.value)}
              error={fieldErrors.emergency_phone?.[0]}
            />
            <Input
              label="Mot de passe"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              hint={PASSWORD_HINT}
              error={fieldErrors.password?.[0]}
            />
            <Input
              label="Confirmer le mot de passe"
              type="password"
              name="password_confirmation"
              autoComplete="new-password"
              required
              value={form.password_confirmation}
              onChange={(e) => update('password_confirmation', e.target.value)}
              error={fieldErrors.password_confirmation?.[0]}
            />
            <Button type="submit" className="mt-2 w-full">
              Continuer
            </Button>
            <p className="text-center text-sm text-on-surface-variant">
              Déjà un compte ?{' '}
              <Link to="/connexion" className="font-semibold text-secondary">
                Se connecter
              </Link>
            </p>
          </form>
        )}

        {step === 1 && (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleCreateAccount}>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Type de véhicule</span>
              <div className="flex gap-2">
                {[
                  { value: 'moto', label: 'Moto' },
                  { value: 'velo', label: 'Vélo' },
                  { value: 'voiture', label: 'Voiture' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => update('vehicle_type', opt.value)}
                    aria-pressed={form.vehicle_type === opt.value}
                    className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${
                      form.vehicle_type === opt.value
                        ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="Plaque d'immatriculation"
              name="vehicle_plate"
              required
              value={form.vehicle_plate}
              onChange={(e) => update('vehicle_plate', e.target.value)}
              error={fieldErrors.vehicle_plate?.[0]}
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

        {step === 2 && !documentsSent && (
          <div className="mt-6">
            <p className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
              Votre compte est créé. Dernière étape : déposez vos pièces pour que notre équipe valide votre profil
              livreur.
            </p>
            <div className="mt-4">
              <DocumentsUpload onDone={() => setDocumentsSent(true)} />
            </div>
            <Link to={ROLE_HOME.livreur} className="btn-tertiary mt-3 block text-center">
              Je le ferai plus tard
            </Link>
          </div>
        )}

        {step === 2 && documentsSent && (
          <div className="mt-6 text-center">
            <h2 className="font-display text-xl font-bold text-primary">Dossier envoyé</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              Notre équipe examine vos pièces sous 24 à 48 h. Vous serez prévenu dès la validation de votre compte.
            </p>
            <Link to={ROLE_HOME.livreur} className="btn-primary mt-6 inline-flex">
              Accéder à mon espace
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
