import { useState } from 'react';
import useNotifications from '../../hooks/useNotifications';
import useAuthStore from '../../store/useAuthStore';
import { rememberDismissal, wasDismissedRecently } from '../../lib/pwa';
import Button from '../common/Button';

const DISMISS_KEY = 'livcorp_push_dismissed_at';

// Ce que chaque profil gagne à activer les notifications : c'est ce qui décide de l'activer ou non.
const BENEFITS = {
  client: 'Soyez prévenu dès qu\'un livreur accepte, vous propose un prix ou arrive, même application fermée.',
  livreur: 'Recevez les nouvelles courses près de vous et les réponses des clients, même application fermée.',
  admin: 'Soyez prévenu des nouveaux dossiers livreurs et des messages de contact.',
};

// Invitation à activer les notifications, en haut des espaces connectés. La demande de permission du
// navigateur ne peut venir que d'un clic : d'où ce bouton, plutôt qu'une demande automatique.
export default function NotificationPrompt() {
  const role = useAuthStore((s) => s.user?.role);
  const { status, busy, error, enable } = useNotifications();
  const [hidden, setHidden] = useState(() => wasDismissedRecently(DISMISS_KEY));

  if (hidden || !BENEFITS[role]) return null;

  function dismiss() {
    rememberDismissal(DISMISS_KEY);
    setHidden(true);
  }

  if (status === 'needs-install') {
    return (
      <Banner onDismiss={dismiss}>
        <p className="text-sm font-semibold">Activez les notifications sur iPhone</p>
        <p className="text-xs text-on-surface-variant">
          Installez d'abord l'application : touchez Partager dans Safari, puis « Sur l'écran d'accueil ». Ouvrez-la
          ensuite depuis l'écran d'accueil pour activer les notifications.
        </p>
      </Banner>
    );
  }

  if (status !== 'off') return null;

  return (
    <Banner onDismiss={dismiss}>
      <p className="text-sm font-semibold">Activer les notifications</p>
      <p className="text-xs text-on-surface-variant">{BENEFITS[role]}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-error">
          {error}
        </p>
      )}
      <Button onClick={enable} disabled={busy} className="mt-2 !px-4 !py-2 text-sm">
        {busy ? 'Activation…' : 'Activer'}
      </Button>
    </Banner>
  );
}

function Banner({ children, onDismiss }) {
  return (
    <div role="region" aria-label="Notifications" className="border-b border-outline-variant bg-primary-fixed">
      <div className="mx-auto flex max-w-[1200px] items-start gap-3 px-4 py-3 sm:px-10">
        <div className="min-w-0 flex-1 text-on-primary-fixed-variant">{children}</div>
        <button type="button" onClick={onDismiss} aria-label="Plus tard" className="flex-shrink-0 px-1 text-2xl leading-none">
          ×
        </button>
      </div>
    </div>
  );
}
