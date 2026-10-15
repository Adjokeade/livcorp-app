import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

// Demande du lien de réinitialisation. La réponse est volontairement la même que le compte existe ou non.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, sent: false, error: '', mailEnabled: true });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, sent: false, error: '' });
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setState({ busy: false, sent: true, error: '', mailEnabled: data.mail_enabled !== false });
    } catch (err) {
      const message = err.response?.status === 429
        ? 'Trop de demandes. Patientez une minute puis réessayez.'
        : err.response?.data?.errors?.email?.[0] ?? (err.response ? 'Demande impossible. Vérifiez l\'adresse saisie.' : 'Serveur injoignable. Vérifiez votre connexion.');
      setState({ busy: false, sent: false, error: message });
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <h1 className="font-display text-2xl font-bold">Mot de passe oublié</h1>

        {state.sent ? (
          <div role="status" className="mt-4">
            {!state.mailEnabled && (
              <p className="mb-3 rounded bg-error-container px-3 py-3 text-sm text-on-error-container">
                <strong>L'envoi d'e-mails n'est pas encore activé sur LIV corp</strong> : vous ne recevrez pas ce message. Pour retrouver
                l'accès à votre compte, écrivez-nous à <a href="mailto:contact@livcorp.bj" className="font-semibold underline">contact@livcorp.bj</a>.
              </p>
            )}
            <p className="rounded bg-primary-fixed px-3 py-3 text-sm text-on-primary-fixed-variant">
              Si un compte existe pour <strong className="break-all">{email}</strong>, un e-mail avec un lien de réinitialisation vient de partir.
              Le lien est valable 60 minutes.
            </p>
            <p className="mt-3 text-sm text-on-surface-variant">Rien reçu ? Vérifiez vos courriers indésirables, ou réessayez dans une minute.</p>
            <button type="button" onClick={() => setState({ busy: false, sent: false, error: '' })} className="mt-3 text-sm font-semibold text-secondary underline">
              Renvoyer un e-mail
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-on-surface-variant">Indiquez l'adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
            {state.error && <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{state.error}</p>}
            <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
              <Input label="E-mail" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" disabled={state.busy} className="w-full">{state.busy ? 'Envoi…' : 'Envoyer le lien'}</Button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          <Link to="/connexion" className="font-semibold text-secondary">Retour à la connexion</Link>
        </p>
      </Card>
    </div>
  );
}
