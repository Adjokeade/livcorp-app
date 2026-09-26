import { useEffect, useState } from 'react';
import { formatAge } from '../../lib/format';

// Rappelle au livreur que sa position est visible du client pendant la course, et l'alerte quand elle ne l'est pas :
// sans position, le client ne voit rien sur sa carte et s'inquiète.
export default function LiveLocationBanner({ state, courseCount }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (state.status === 'idle') return null;

  const plural = courseCount > 1 ? 'vos clients' : 'votre client';

  if (state.status === 'denied') {
    return (
      <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
        <strong>Localisation refusée.</strong> Sans elle, {plural} ne voit pas où vous êtes. Autorisez la localisation
        pour ce site dans les réglages de votre navigateur, puis revenez ici.
      </p>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
        La localisation n'est pas disponible sur cet appareil : {plural} ne pourra pas vous suivre.
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="mt-4 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
        Position non envoyée (réseau ou GPS indisponible). Nouvelle tentative en cours…
      </p>
    );
  }

  return (
    <p role="status" className="mt-4 rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
      <strong>Position partagée avec {plural}</strong>
      {state.lastSentAt ? ` · envoyée ${formatAge((now - state.lastSentAt) / 1000)}` : ''}. Gardez l'application ouverte et l'écran
      allumé pendant la course.
    </p>
  );
}
