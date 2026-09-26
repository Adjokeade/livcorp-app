import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useNoIndex from '../../hooks/useNoIndex';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

// Connexion de l'espace administrateur, à part de la connexion publique : mise en page sobre, aucun lien vers
// l'inscription, un seul type de compte accepté. Le serveur répond la même chose pour un compte inconnu, un mot
// de passe faux ou un compte qui n'est pas administrateur : aucun message ici ne doit en dire plus.
export default function AdminLogin() {
  useNoIndex();
  const { adminLogin, status, error, clearError, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });

  useEffect(() => {
    clearError();
  }, [clearError]);

  // Déjà connecté en administrateur : direction le back-office.
  if (status === 'authenticated' && user?.role === 'admin') {
    return <Navigate to={location.state?.from?.pathname?.startsWith('/admin') ? location.state.from.pathname : '/admin'} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await adminLogin(form.email, form.password);
      navigate('/admin', { replace: true });
    } catch {
      // l'erreur est exposée par le store
      setForm((f) => ({ ...f, password: '' }));
    }
  }

  const connectedAsOther = status === 'authenticated' && user && user.role !== 'admin';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a6e] px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="text-center font-display text-3xl font-extrabold">
          <span className="text-primary">LIV</span> <span className="italic text-[#8fb4ea]">corp</span>
        </p>
        <p className="mt-1 text-center text-sm font-semibold uppercase tracking-widest text-[#8fb4ea]">Administration</p>

        <div className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-modal">
          <h1 className="font-display text-xl font-bold">Connexion</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Accès réservé à l'équipe LIV corp.</p>

          {connectedAsOther && (
            <p className="mt-4 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
              Vous êtes connecté avec un autre compte. Se connecter ici le remplacera.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
              {error}
            </p>
          )}

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <Input
              label="Adresse e-mail"
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
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
            <Button type="submit" disabled={status === 'loading'} className="mt-1 w-full">
              {status === 'loading' ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>

          <p className="mt-5 text-xs text-on-surface-variant">
            Les connexions à cet espace sont enregistrées. La session se ferme automatiquement au bout de 8 heures.
          </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link to="/" className="text-[#8fb4ea] underline">
            Retour au site
          </Link>
        </p>
      </div>
    </div>
  );
}
