import useNotifications from '../../hooks/useNotifications';

// Rappel discret en bas des espaces connectés : état des notifications sur cet appareil, et moyen de les couper.
export default function NotificationSettings() {
  const { status, busy, disable, enable } = useNotifications();

  if (status === 'loading' || status === 'unsupported' || status === 'unavailable' || status === 'needs-install') return null;

  return (
    <p className="mt-10 text-center text-xs text-on-surface-variant">
      {status === 'on' && (
        <>
          Notifications activées sur cet appareil.{' '}
          <button type="button" onClick={disable} disabled={busy} className="font-semibold text-secondary underline">
            Désactiver
          </button>
        </>
      )}
      {status === 'off' && (
        <>
          Notifications désactivées sur cet appareil.{' '}
          <button type="button" onClick={enable} disabled={busy} className="font-semibold text-secondary underline">
            Activer
          </button>
        </>
      )}
      {status === 'blocked' && 'Notifications bloquées : autorisez-les dans les réglages du site de votre navigateur.'}
    </p>
  );
}
