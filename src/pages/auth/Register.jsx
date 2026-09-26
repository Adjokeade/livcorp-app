import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { ROLE_HOME } from '../../lib/roleHome';

// La plateforme s'adresse à trois profils : entreprises et particuliers qui
// envoient des colis (rôle "client"), et livreurs. Pas de notion de
// commerçant/boutique — cf. cahier des charges "Parcours de l'expéditeur".
const ACCOUNT_TYPES = [
  { value: 'particulier', label: 'Particulier', description: 'Je veux faire livrer mes colis.' },
  { value: 'entreprise', label: 'Entreprise', description: 'Mon entreprise envoie des colis régulièrement.' },
];

const PASSWORD_HINT = '8 caractères minimum, avec une majuscule, une minuscule et un chiffre.';

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { register, status, error, clearError } = useAuthStore();
  const [form, setForm] = useState({
    role: 'client',
    account_type: searchParams.get('account_type') === 'entreprise' ? 'entreprise' : 'particulier',
    company_name: '',
    first_name: '',
    last_name: '',
    sex: '',
    address: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const isEntreprise = form.account_type === 'entreprise';
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  // Une erreur restée dans le store depuis une autre page (connexion…) ne doit pas s'afficher ici.
  useEffect(() => {
    clearError();
  }, [clearError]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    // L'erreur d'un champ disparaît dès qu'on le corrige.
    setFieldErrors((errs) => {
      if (!errs[field]) return errs;
      const next = { ...errs };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Le choix Homme/Femme est un groupe de boutons : `required` HTML ne s'y applique pas.
    if (!isEntreprise && !form.sex) {
      setFieldErrors({ sex: ['Choisissez Homme ou Femme.'] });
      return;
    }
    if (form.password !== form.password_confirmation) {
      setFieldErrors({ password_confirmation: ['Les deux mots de passe ne correspondent pas.'] });
      return;
    }

    setFieldErrors({});
    try {
      // Envoyé tel quel : pour une entreprise, le sexe et le nom du gérant n'ont pas de sens côté serveur.
      const payload = isEntreprise ? { ...form, sex: '' } : { ...form, company_name: '' };
      const { user } = await register(payload);
      navigate(user ? (ROLE_HOME[user.role] ?? '/') : '/connexion', { replace: true });
    } catch (err) {
      setFieldErrors(err.response?.data?.errors ?? {});
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <h1 className="font-display text-2xl font-bold">Créer un compte</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Livreur ?{' '}
          <Link to="/inscription/livreur" className="font-semibold text-secondary">
            Rejoignez la flotte ici
          </Link>
          .
        </p>

        {error && !hasFieldErrors && (
          <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-6">
          <span className="mb-1.5 block text-sm font-semibold">Je suis…</span>
          <div className="grid grid-cols-2 gap-2">
            {ACCOUNT_TYPES.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => update('account_type', opt.value)}
                className={`rounded border px-3 py-2 text-sm font-semibold transition ${
                  form.account_type === opt.value
                    ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                    : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">
            {ACCOUNT_TYPES.find((opt) => opt.value === form.account_type)?.description}
          </p>
        </div>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          {isEntreprise && (
            <Input
              label="Nom de l'entreprise"
              name="company_name"
              required
              value={form.company_name}
              onChange={(e) => update('company_name', e.target.value)}
              error={fieldErrors.company_name?.[0]}
            />
          )}

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Input
              label={isEntreprise ? 'Prénom du gérant' : 'Prénom'}
              name="first_name"
              autoComplete="given-name"
              required
              value={form.first_name}
              onChange={(e) => update('first_name', e.target.value)}
              error={fieldErrors.first_name?.[0]}
            />
            <Input
              label={isEntreprise ? 'Nom du gérant' : 'Nom'}
              name="last_name"
              autoComplete="family-name"
              required
              value={form.last_name}
              onChange={(e) => update('last_name', e.target.value)}
              error={fieldErrors.last_name?.[0]}
            />
          </div>

          {!isEntreprise && (
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
          )}

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

          <Button type="submit" disabled={status === 'loading'} className="mt-2 w-full">
            {status === 'loading' ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Déjà un compte ?{' '}
          <Link to="/connexion" className="font-semibold text-secondary">
            Se connecter
          </Link>
        </p>
      </Card>
    </div>
  );
}
