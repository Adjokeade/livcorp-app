import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { ROLE_HOME } from '../lib/roleHome';
import serviceProviderService from '../services/serviceProviderService';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Reveal from '../components/common/Reveal';
import coursierPhoto from '../assets/images/service-coursiers.jpg';

// Métiers proposés tant que la liste du serveur n'est pas arrivée (elle fait foi dès qu'elle l'est).
const FALLBACK_PROFESSIONS = [
  { value: 'plombier', label: 'Plombier' },
  { value: 'electricien', label: 'Électricien' },
  { value: 'coiffeur', label: 'Coiffeur / coiffeuse' },
  { value: 'informaticien', label: 'Informaticien' },
  { value: 'autre', label: 'Autre métier' },
];

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  sex: '',
  email: '',
  phone: '',
  password: '',
  password_confirmation: '',
  profession: '',
  profession_other: '',
  city: '',
  address: '',
  experience_years: '',
  description: '',
};

const BENEFITS = [
  'Des clients de votre ville qui cherchent votre métier',
  'Un profil examiné et validé par l\'équipe LIV corp',
  'Aucun frais pour déposer votre candidature',
];

// Inscription publique des prestataires de services (plombiers, coiffeuses, informaticiens…).
// Pas de compte à créer : la candidature est examinée par l'administration, qui rappelle la personne.
export default function Prestataires() {
  const navigate = useNavigate();
  const { user, login } = useAuthStore();
  const [professions, setProfessions] = useState(FALLBACK_PROFESSIONS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    serviceProviderService.professions().then((list) => list?.length && setProfessions(list)).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((errs) => {
      if (!errs[field]) return errs;
      const next = { ...errs };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      setFieldErrors({ password_confirmation: ['Les deux mots de passe ne correspondent pas.'] });
      return;
    }
    setSending(true);
    setError('');
    setFieldErrors({});
    try {
      await serviceProviderService.apply({ ...form, sex: form.sex || null, profession_other: form.profession === 'autre' ? form.profession_other : null });
      // Compte créé : connexion immédiate, l'espace prestataire affiche l'état du dossier.
      try {
        const logged = await login(form.email, form.password, 'prestataire');
        navigate(ROLE_HOME[logged.role] ?? '/', { replace: true });
        return;
      } catch {
        setSent(true);
      }
      setForm(EMPTY_FORM);
    } catch (err) {
      const errors = err.response?.data?.errors ?? {};
      setFieldErrors(errors);
      setError(
        err.response?.status === 429
          ? 'Trop de tentatives. Patientez une minute puis réessayez.'
          : err.response
          ? Object.keys(errors).length ? 'Vérifiez les champs signalés.' : (err.response.data?.message ?? 'Envoi impossible. Réessayez.')
          : 'Serveur injoignable. Vérifiez votre connexion puis réessayez.',
      );
    } finally {
      setSending(false);
    }
  }

  // Un prestataire déjà connecté n'a plus rien à remplir ici : il retrouve ses offres.
  if (user?.role === 'prestataire') return <Navigate to={ROLE_HOME.prestataire} replace />;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-extrabold">
          Prestataires, <span className="text-primary">développez votre activité</span>
        </h1>
        <p className="mt-4 text-lg text-on-surface-variant">
          Plombiers, électriciens, coiffeuses, informaticiens… Inscrivez-vous pour proposer vos services aux clients de LIV corp.
        </p>
        <p className="mt-4 text-sm text-on-surface-variant">
          Déjà inscrit ?{' '}
          <Link to="/connexion?profil=prestataire" className="font-semibold text-secondary">
            Se connecter et voir les offres
          </Link>
          <br />
          Candidat avant la création des comptes ? Inscrivez-vous avec le même téléphone : votre dossier est retrouvé.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-5 lg:items-start lg:gap-12">
        <Reveal className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl">
            <img src={coursierPhoto} alt="Un prestataire en déplacement chez un client" loading="lazy" className="aspect-[4/3] w-full object-cover" />
          </div>
          <ul className="mt-6 flex flex-col gap-3 text-sm">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span className="mt-0.5 text-secondary">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-on-surface-variant">
            Vous livrez des colis plutôt que des services ?{' '}
            <Link to="/inscription/livreur" className="font-semibold text-secondary">
              Rejoignez la flotte de livreurs
            </Link>
            .
          </p>
        </Reveal>

        <Card className="lg:col-span-3">
          {sent ? (
            <div role="status" className="py-6 text-center">
              <h2 className="font-display text-xl font-bold text-primary">Compte créé</h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                Merci ! Connectez-vous : les offres s'ouvrent dès que notre équipe a validé votre dossier.
              </p>
              <Button variant="secondary" className="mt-6" onClick={() => setSent(false)}>
                Revenir au formulaire
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <h2 className="font-display text-xl font-bold">Je m'inscris comme prestataire</h2>

              {error && (
                <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <Input label="Prénom" name="first_name" autoComplete="given-name" required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} error={fieldErrors.first_name?.[0]} />
                <Input label="Nom" name="last_name" autoComplete="family-name" required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} error={fieldErrors.last_name?.[0]} />
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-semibold">Sexe (facultatif)</span>
                <div className="flex gap-2">
                  {[['homme', 'Homme'], ['femme', 'Femme']].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => update('sex', form.sex === value ? '' : value)}
                      aria-pressed={form.sex === value}
                      className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${
                        form.sex === value ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant' : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="profession" className="mb-1.5 block text-sm font-semibold">Votre métier</label>
                <select id="profession" name="profession" required className="input-field" value={form.profession} onChange={(e) => update('profession', e.target.value)}>
                  <option value="" disabled>Choisir un métier</option>
                  {professions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {fieldErrors.profession?.[0] && <p className="mt-1 text-xs font-medium text-error">{fieldErrors.profession[0]}</p>}
              </div>

              {form.profession === 'autre' && (
                <Input label="Précisez votre métier" name="profession_other" required value={form.profession_other} onChange={(e) => update('profession_other', e.target.value)} error={fieldErrors.profession_other?.[0]} />
              )}

              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <Input label="Téléphone" type="tel" name="phone" autoComplete="tel" placeholder="+229 …" required value={form.phone} onChange={(e) => update('phone', e.target.value)} error={fieldErrors.phone?.[0]} />
                <Input label="E-mail" type="email" name="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} error={fieldErrors.email?.[0]} />
              </div>

              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <Input label="Ville" name="city" required value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Cotonou, Porto-Novo…" error={fieldErrors.city?.[0]} />
                <Input label="Quartier (facultatif)" name="address" value={form.address} onChange={(e) => update('address', e.target.value)} error={fieldErrors.address?.[0]} />
              </div>

              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <Input label="Mot de passe" type="password" name="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} hint="8 caractères minimum, avec majuscule, minuscule et chiffre." error={fieldErrors.password?.[0]} />
                <Input label="Confirmer le mot de passe" type="password" name="password_confirmation" autoComplete="new-password" required value={form.password_confirmation} onChange={(e) => update('password_confirmation', e.target.value)} error={fieldErrors.password_confirmation?.[0]} />
              </div>

              <Input
                label="Années d'expérience"
                type="number"
                name="experience_years"
                min="0"
                max="60"
                required
                value={form.experience_years}
                onChange={(e) => update('experience_years', e.target.value)}
                error={fieldErrors.experience_years?.[0]}
              />

              <div>
                <label htmlFor="description" className="mb-1.5 block text-sm font-semibold">Vos services</label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  required
                  minLength={20}
                  maxLength={1500}
                  className="input-field"
                  placeholder="Décrivez ce que vous faites, votre matériel, vos disponibilités…"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                />
                {fieldErrors.description?.[0] ? (
                  <p className="mt-1 text-xs font-medium text-error">{fieldErrors.description[0]}</p>
                ) : (
                  <p className="mt-1 text-xs text-on-surface-variant">20 caractères minimum.</p>
                )}
              </div>

              <Button type="submit" disabled={sending} className="w-full">
                {sending ? 'Envoi…' : 'Envoyer ma candidature'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
