import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

// Choix du nouveau mot de passe, depuis le lien reçu par e-mail (?token=…&email=…).
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const [form, setForm] = useState({ password: '', password_confirmation: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '', fields: {} });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, done: false, error: '', fields: {} });
    try {
      await api.post('/auth/reset-password', { token, email, ...form });
      setState({ busy: false, done: true, error: '', fields: {} });
    } catch (err) {
      const raw = err.response?.data?.errors ?? {};
      setState({
        busy: false,
        done: false,
        fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]])),
        error: raw.token?.[0] ?? (err.response ? (Object.keys(raw).length ? '' : 'Changement impossible. Réessayez.') : 'Serveur injoignable. Vérifiez votre connexion.'),
      });
    }
  }

  const linkBroken = !token || !email;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <h1 className="font-display text-2xl font-bold">Nouveau mot de passe</h1>

        {state.done ? (
          <div role="status" className="mt-4">
            <p className="rounded bg-primary-fixed px-3 py-3 text-sm text-on-primary-fixed-variant">
              Mot de passe modifié. Vos autres appareils ont été déconnectés par sécurité.
            </p>
            <Link to="/connexion" className="btn-primary mt-4 w-full">Se connecter</Link>
          </div>
        ) : linkBroken ? (
          <div className="mt-4">
            <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">Ce lien est incomplet. Ouvrez-le depuis l'e-mail reçu, ou faites une nouvelle demande.</p>
            <Link to="/mot-de-passe-oublie" className="btn-primary mt-4 w-full">Nouvelle demande</Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-on-surface-variant">Compte : <strong className="break-all text-on-surface">{email}</strong></p>
            {state.error && (
              <div role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
                {state.error}{' '}
                {state.fields.token && <Link to="/mot-de-passe-oublie" className="font-semibold underline">Nouvelle demande</Link>}
              </div>
            )}
            <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
              <Input
                label="Nouveau mot de passe"
                type="password"
                name="password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                error={state.fields.password}
                hint="8 caractères minimum, avec majuscule, minuscule et chiffre."
              />
              <Input
                label="Confirmation"
                type="password"
                name="password_confirmation"
                autoComplete="new-password"
                required
                value={form.password_confirmation}
                onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
              />
              <Button type="submit" disabled={state.busy} className="w-full">{state.busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
