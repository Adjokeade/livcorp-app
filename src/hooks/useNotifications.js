import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, getPushStatus } from '../lib/push';

// Plusieurs composants affichent l'état des notifications (bandeau d'invitation, ligne d'état en bas de page).
// Chacun a son propre état : cet événement les resynchronise dès que l'un d'eux active ou désactive.
const CHANGED_EVENT = 'livcorp:push-changed';

// État des notifications push de cet appareil, et actions pour les activer/désactiver.
export default function useNotifications() {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => setStatus(await getPushStatus()), []);

  useEffect(() => {
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await enablePush();
    } catch (err) {
      setError(
        err.message === 'blocked'
          ? 'Les notifications sont bloquées dans votre navigateur. Autorisez-les dans les réglages du site.'
          : err.message === 'dismissed'
            ? 'Demande ignorée : vous pourrez les activer plus tard.'
            : "Impossible d'activer les notifications sur cet appareil. Réessayez.",
      );
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(CHANGED_EVENT));
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await disablePush();
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(CHANGED_EVENT));
    }
  }, []);

  return { status, busy, error, enable, disable };
}
