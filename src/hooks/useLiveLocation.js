import { useEffect, useState } from 'react';
import delivererService from '../services/delivererService';

const INTERVAL_MS = 8000;

// Partage la position du livreur avec le client pendant TOUTE la course (vers le point de collecte, puis vers la
// destination), sans qu'il ait à faire quoi que ce soit : c'est ce qui permet au client de suivre son colis.
//
// Limite des navigateurs : la géolocalisation ne fonctionne que pendant que l'application est ouverte et l'écran
// allumé (une PWA ne peut pas suivre en arrière-plan). On demande donc au navigateur de garder l'écran allumé
// (Wake Lock) et on prévient le livreur.
//
// status : idle | sharing | denied | unavailable | error
export default function useLiveLocation(orderIds) {
  const [state, setState] = useState({ status: 'idle', lastSentAt: null });
  const key = orderIds.join(',');

  useEffect(() => {
    if (orderIds.length === 0) {
      setState({ status: 'idle', lastSentAt: null });
      return undefined;
    }
    if (!navigator.geolocation) {
      setState({ status: 'unavailable', lastSentAt: null });
      return undefined;
    }

    let cancelled = false;
    let wakeLock = null;

    async function keepScreenOn() {
      try {
        wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        // non pris en charge, ou refusé (batterie faible) : sans conséquence
      }
    }

    function share() {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const results = await Promise.allSettled(orderIds.map((id) => delivererService.pushLocation(id, coords.latitude, coords.longitude)));
          if (cancelled) return;
          // Une course déjà terminée répond 422 : ce n'est pas un échec de réseau, on l'ignore.
          const reached = results.some((r) => r.status === 'fulfilled' || r.reason?.response);
          setState((prev) => ({ status: reached ? 'sharing' : 'error', lastSentAt: reached ? Date.now() : prev.lastSentAt, accuracy: coords.accuracy }));
        },
        (err) => {
          if (cancelled) return;
          setState((prev) => ({ status: err.code === 1 ? 'denied' : 'error', lastSentAt: prev.lastSentAt }));
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      keepScreenOn(); // le verrou est perdu quand l'application passe en arrière-plan
      share();
    };

    keepScreenOn();
    share();
    const timer = setInterval(share, INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
