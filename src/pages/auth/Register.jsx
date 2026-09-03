import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

// Champs strictement alignés sur RegisterRequest côté backend
// (role: client|commercant|livreur, first_name, last_name, email, phone, password, password_confirmation).
// L'inscription livreur a son propre parcours (dépôt de pièces) : voir RegisterDeliverer.jsx.
export default function Register() {
  const [searchParams] = useSearchParams();
  const { register, status, error } = useAuthStore();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    role: searchParams.get('role') === 'commercant' ? 'commercant' : 'client',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFieldErrors({});
    try {
      await register(form);
      setDone(true);
    } catch (err) {
      setFieldErrors(err.response?.data?.errors ?? {});
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card>
          <h1 className="font-display text-2xl font-bold text-primary">Compte créé 🎉</h1>
          <p className="mt-3 text-on-surface-variant">
            Vérifiez votre boîte e-mail pour activer votre compte, puis connectez-vous.
          </p>
          <Link to="/connexion" className="btn-primary mt-6 inline-block">
            Aller à la connexion
          </Link>
        </Card>
      </div>
    );
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

        {error && <p className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Je suis…</span>
            <div className="flex gap-2">
              {[
                { value: 'client', label: 'Client' },
                { value: 'commercant', label: 'Commerçant' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => update('role', opt.value)}
                  className={`flex-1 rounded border px-4 py-2 text-sm font-semibold transition ${
                    form.role === opt.value
                      ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Prénom"
              name="first_name"
              required
              value={form.first_name}
              onChange={(e) => update('first_name', e.target.value)}
              error={fieldErrors.first_name?.[0]}
            />
            <Input
              label="Nom"
              name="last_name"
              required
              value={form.last_name}
              onChange={(e) => update('last_name', e.target.value)}
              error={fieldErrors.last_name?.[0]}
            />
          </div>
          <Input
            label="E-mail"
            type="email"
            name="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            error={fieldErrors.email?.[0]}
          />
          <Input
            label="Téléphone"
            type="tel"
            name="phone"
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
            required
            minLength={8}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            error={fieldErrors.password?.[0]}
          />
          <Input
            label="Confirmer le mot de passe"
            type="password"
            name="password_confirmation"
            required
            value={form.password_confirmation}
            onChange={(e) => update('password_confirmation', e.target.value)}
          />

          <Button type="submit" disabled={status === 'loading'} className="mt-2 w-full">
            {status === 'loading' ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
