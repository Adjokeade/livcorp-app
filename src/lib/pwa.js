import { useCallback, useSyncExternalStore } from 'react';

// Installation de l'application (PWA). L'événement "beforeinstallprompt" peut se déclencher avant que
// React ne soit monté : on l'écoute dès l'import de ce module (depuis main.jsx) et on le conserve.
let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // on affichera notre propre invitation au bon moment
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iOS n'expose pas d'invitation d'installation : il faut passer par le menu Partager de Safari.
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false);

  const install = useCallback(async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    emit();
    return outcome; // 'accepted' | 'dismissed'
  }, []);

  return { canInstall, install };
}

// Mémorise qu'une invitation a été écartée, pour ne pas la reproposer à chaque page.
export function wasDismissedRecently(key, days = 7) {
  try {
    const at = Number(localStorage.getItem(key));
    return Boolean(at) && Date.now() - at < days * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

export function rememberDismissal(key) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // stockage indisponible (navigation privée) : l'invitation reviendra, sans conséquence
  }
}

export function useOnline() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
