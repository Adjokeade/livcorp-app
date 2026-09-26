import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import useAuthStore from '../../store/useAuthStore';
import InstallBanner from '../pwa/InstallBanner';
import NotificationPrompt from '../pwa/NotificationPrompt';
import NotificationSettings from '../pwa/NotificationSettings';
import OfflineBanner from '../pwa/OfflineBanner';

// Rappel affiché tant que l'adresse e-mail n'est pas vérifiée : sans elle,
// le serveur refuse de créer des commandes (middleware verified.email).
// N'apparaît jamais si le serveur marque les comptes vérifiés d'office
// (EMAIL_VERIFICATION_REQUIRED=false).
function VerifyEmailBanner({ user }) {
  const { resendVerification } = useAuthStore();
  const [state, setState] = useState('idle'); // idle | sending | sent | failed

  async function resend() {
    setState('sending');
    try {
      await resendVerification();
      setState('sent');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="border-b border-outline-variant bg-primary-fixed">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-3 text-sm text-on-primary-fixed-variant sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <p>
          Confirmez votre adresse e-mail <strong className="break-all">{user.email}</strong> pour pouvoir commander.
        </p>
        {state === 'sent' ? (
          <span className="font-semibold">E-mail renvoyé, vérifiez votre boîte de réception.</span>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={state === 'sending'}
            className="self-start font-semibold underline sm:self-auto"
          >
            {state === 'sending' ? 'Envoi…' : state === 'failed' ? 'Échec, réessayer' : "Renvoyer l'e-mail"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const needsVerification = user && user.role !== 'admin' && !user.email_verified_at;

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <OfflineBanner />
      <Header />
      {user && <NotificationPrompt />}
      {needsVerification && <VerifyEmailBanner user={user} />}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-10 sm:py-10">
        <Outlet />
        {user && <NotificationSettings />}
      </main>
      <InstallBanner />
    </div>
  );
}
