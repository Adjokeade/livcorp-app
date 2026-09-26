import { useEffect, useState } from 'react';
import clientOrderService from '../services/clientOrderService';
import { subscribeToOrder } from '../lib/echo';

const TRACKABLE = ['acceptee', 'colis_recupere', 'en_cours_livraison'];
const FINAL = ['livree', 'annulee'];

// Suivi du colis côté client : position du livreur, trace, direction et temps restant.
//  - relecture toutes les 5 s pendant la course (fonctionne partout, sans serveur temps réel) ;
//  - si un serveur temps réel (Reverb) est configuré, il pousse en plus chaque position instantanément.
// La relecture s'arrête quand l'onglet est masqué et quand la course n'est plus en cours.
export default function useOrderTracking(orderId, order, onStatusChanged) {
  const [tracking, setTracking] = useState(null);
  const status = order?.status;
  const hasDeliverer = Boolean(order?.deliverer);
  const trackable = hasDeliverer && TRACKABLE.includes(status);
  const open = Boolean(order) && !FINAL.includes(status);

  useEffect(() => {
    if (!trackable) return undefined;
    let cancelled = false;

    const load = () => {
      if (document.hidden) return;
      clientOrderService
        .track(orderId)
        .then((data) => {
          if (!cancelled) setTracking({ ...data, receivedAt: Date.now() });
        })
        .catch(() => {});
    };

    load();
    const timer = setInterval(load, 5000);
    const onVisible = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [orderId, trackable]);

  // Diffusion temps réel, seulement si le serveur est configuré (clé Reverb renseignée).
  useEffect(() => {
    if (!open || !import.meta.env.VITE_REVERB_APP_KEY) return undefined;

    try {
      return subscribeToOrder(orderId, {
        onLocationUpdated: (payload) => {
          const point = [Number(payload.lat), Number(payload.lng)];
          setTracking((prev) => ({
            ...(prev ?? { trail: [], target: null, eta_min: null, distance_km: null }),
            position: { lat: point[0], lng: point[1], age_seconds: 0 },
            trail: [...(prev?.trail ?? []), point].slice(-60),
            sharing: true,
            receivedAt: Date.now(),
          }));
        },
        onStatusChanged,
      });
    } catch {
      return undefined; // le temps réel est un bonus : la relecture prend le relais
    }
  }, [orderId, open, onStatusChanged]);

  return tracking;
}
