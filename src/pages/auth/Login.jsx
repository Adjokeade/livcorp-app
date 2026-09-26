import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { homeAfterLogin } from '../../lib/roleHome';

// Mêmes trois profils qu'à l'inscription. La connexion elle-même ne change
// pas (un compte a un seul rôle, déjà connu du serveur) : ce choix sert
// surtout à orienter vers la bonne inscription si l'utilisateur n'a pas
// encore de compte, et à garder une expérience cohérente d'un écran à l'autre.
const PROFILES = [
  { value: 'particulier', label: 'Particulier', registerTo: '/inscription?account_type=particulier' },
  { value: 'entreprise', label: 'Entreprise', registerTo: '/inscription?account_type=entreprise' },
  { value: 'livreur', label: 'Livreur', registerTo: '/inscription/livreur' },
];

export default function Login() {
  const { login, status, error, clearError, user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const justVerified = searchParams.get('verified') === '1';
  const [profile, setProfile] = useState('particulier');
  const [form, setForm] = useState({ email: '', password: '' });

  // Une erreur restée dans le store depuis une autre page (inscription…) ne doit pas s'afficher ici.
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Déjà connecté : inutile de re-saisir ses identifiants.
  if (status === 'authenticated' && currentUser) {
    return <Navigate to={homeAfterLogin(currentUser, location.state?.from?.pathname)} replace />;
  }

  const registerTo = PROFILES.find((p) => p.value === profile)?.registerTo ?? '/inscription';

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const user = await login(form.email, form.password);
      navigate(homeAfterLogin(user, location.state?.from?.pathname), { replace: true });
    } catch {
      // l'erreur est déjà exposée via le store (cf. `error`)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <h1 className="font-display text-2xl font-bold">Connexion</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Ravis de vous revoir sur LIV corp.</p>

        <div className="mt-6">
          <span className="mb-1.5 block text-sm font-semibold">Je suis…</span>
          <div className="grid grid-cols-3 gap-2">
            {PROFILES.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setProfile(opt.value)}
                className={`rounded border px-3 py-2 text-sm font-semibold transition ${
                  profile === opt.value
                    ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                    : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {justVerified && !error && (
          <p className="mt-4 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            Adresse e-mail vérifiée. Vous pouvez vous connecter.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="E-mail"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Mot de passe"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button type="submit" disabled={status === 'loading'} className="mt-2 w-full">
            {status === 'loading' ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Pas encore de compte ?{' '}
          <Link to={registerTo} className="font-semibold text-secondary">
            Créer un compte
          </Link>
        </p>
      </Card>
    </div>
  );
}
