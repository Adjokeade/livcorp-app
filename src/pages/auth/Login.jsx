import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

const ROLE_HOME = {
  client: '/client/commander',
  commercant: '/merchant/tableau-de-bord',
  livreur: '/deliverer/tableau-de-bord',
  admin: '/admin',
};

export default function Login() {
  const { login, status, error } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const user = await login(form.email, form.password);
      const redirectTo = location.state?.from?.pathname ?? ROLE_HOME[user.role] ?? '/';
      navigate(redirectTo, { replace: true });
    } catch {
      // l'erreur est déjà exposée via le store (cf. `error`)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <h1 className="font-display text-2xl font-bold">Connexion</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Ravis de vous revoir sur LIV corp.</p>

        {error && (
          <p className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>
        )}

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="E-mail"
            type="email"
            name="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Mot de passe"
            type="password"
            name="password"
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
          <Link to="/inscription" className="font-semibold text-secondary">
            Créer un compte
          </Link>
        </p>
      </Card>
    </div>
  );
}
