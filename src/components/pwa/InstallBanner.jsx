import { useState } from 'react';
import { isIos, isStandalone, rememberDismissal, useInstallPrompt, wasDismissedRecently } from '../../lib/pwa';
import Button from '../common/Button';

const DISMISS_KEY = 'livcorp_install_dismissed_at';

// Invitation à installer l'application sur l'écran d'accueil. Elle n'apparaît que si l'installation est
// possible (Chrome/Edge/Android) ou, sur iPhone, avec le mode d'emploi du menu Partager de Safari.
export default function InstallBanner() {
  const { canInstall, install } = useInstallPrompt();
  const [hidden, setHidden] = useState(() => wasDismissedRecently(DISMISS_KEY));

  const showIosHelp = !canInstall && isIos() && !isStandalone();
  if (hidden || isStandalone() || (!canInstall && !showIosHelp)) return null;

  function dismiss() {
    rememberDismissal(DISMISS_KEY);
    setHidden(true);
  }

  return (
    <div
      role="region"
      aria-label="Installer l'application"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-outline-variant bg-surface-container-lowest px-4 pt-3 shadow-modal"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3">
        <img src="/icons/pwa-192x192.png" alt="" className="h-11 w-11 flex-shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Installez LIV corp</p>
          <p className="text-xs text-on-surface-variant">
            {canInstall
              ? 'Accès direct depuis votre écran d\'accueil, et notifications même application fermée.'
              : "Touchez Partager dans Safari, puis « Sur l'écran d'accueil »."}
          </p>
        </div>
        {canInstall && (
          <Button onClick={install} className="flex-shrink-0 !px-4 !py-2 text-sm">
            Installer
          </Button>
        )}
        <button type="button" onClick={dismiss} aria-label="Fermer" className="flex-shrink-0 px-1 text-2xl leading-none text-on-surface-variant">
          ×
        </button>
      </div>
    </div>
  );
}
