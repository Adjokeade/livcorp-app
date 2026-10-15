import { useEffect, useRef, useState } from 'react';
import delivererService from '../services/delivererService';

const SEND_EVERY_MS = 6000;       // une position toutes les 6 s au plus
const KEEPALIVE_MS = 30000;       // même à l'arrêt, une position au moins toutes les 30 s (le client voit « en direct »)
const MIN_MOVE_M = 12;            // sinon, on n'envoie qu'après un déplacement d'au moins 12 m
const POOR_ACCURACY_M = 150;      // au-delà, la lecture GPS est écartée…
const POOR_ACCEPTED_AFTER_MS = 45000; // …sauf si on n'a rien de meilleur depuis 45 s (mieux qu'aucune position)

// Distance à vol d'oiseau en mètres (suffit pour décider d'un envoi).
function metersBetween(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Partage la position du livreur avec le client pendant TOUTE la course (vers le point de collecte, puis vers la
// destination), sans qu'il ait à faire quoi que ce soit : c'est ce qui permet au client de suivre son colis.
//
// Suivi continu (watchPosition, haute précision) plutôt qu'une lecture ponctuelle : le GPS reste « chaud » et la
// position est toujours la dernière connue. Les lectures imprécises sont écartées, et on n'envoie que quand le
// livreur a bougé (ou toutes les 30 s), ce qui ménage batterie et données.
//
// Limite des navigateurs : la géolocalisation ne fonctionne que pendant que l'application est ouverte et l'écran
// allumé (une PWA ne peut pas suivre en arrière-plan). On demande donc au navigateur de garder l'écran allumé
// (Wake Lock) et on prévient le livreur.
//
// status : idle | sharing | denied | unavailable | error ; coords : dernière position retenue { lat, lng }.
export default function useLiveLocation(orderIds) {
  const [state, setState] = useState({ status: 'idle', lastSentAt: null, coords: null, accuracy: null });
  const latest = useRef(null); // { lat, lng, accuracy, at }
  const lastSent = useRef(null); // { lat, lng, at }
  const key = orderIds.join(',');

  useEffect(() => {
    if (orderIds.length === 0) {
      setState({ status: 'idle', lastSentAt: null, coords: null, accuracy: null });
      return undefined;
    }
    if (!navigator.geolocation) {
      setState({ status: 'unavailable', lastSentAt: null, coords: null, accuracy: null });
      return undefined;
    }

    let cancelled = false;
    let wakeLock = null;
    let sending = false;
    let lastGoodAt = 0;

    async function keepScreenOn() {
      try {
        wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        // non pris en charge, ou refusé (batterie faible) : sans conséquence
      }
    }

    function onPosition({ coords }) {
      const reading = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy ?? null, at: Date.now() };
      const poor = reading.accuracy != null && reading.accuracy > POOR_ACCURACY_M;

      if (poor && Date.now() - lastGoodAt < POOR_ACCEPTED_AFTER_MS) return; // on garde la bonne lecture précédente
      if (!poor) lastGoodAt = Date.now();

      latest.current = reading;
      // Une position qui arrive prouve que l'autorisation est accordée : fin de l'alerte « refusée » le cas échéant.
      setState((prev) => ({ ...prev, status: prev.status === 'denied' ? 'error' : prev.status, coords: { lat: reading.lat, lng: reading.lng }, accuracy: reading.accuracy }));
    }

    function onError(err) {
      if (cancelled) return;
      setState((prev) => ({ ...prev, status: err.code === 1 ? 'denied' : 'error' }));
    }

    async function flush() {
      const reading = latest.current;
      if (cancelled || sending || !reading) return;

      const previous = lastSent.current;
      const moved = !previous || metersBetween(previous, reading) >= MIN_MOVE_M;
      const stale = !previous || Date.now() - previous.at >= KEEPALIVE_MS;
      if (!moved && !stale) return;
      if (previous && previous.readingAt === reading.at && !stale) return; // déjà envoyée

      sending = true;
      const results = await Promise.allSettled(
        orderIds.map((id) => delivererService.pushLocation(id, reading.lat, reading.lng, reading.accuracy)),
      );
      sending = false;
      if (cancelled) return;

      // Une course déjà terminée répond 422 : ce n'est pas un échec de réseau, on l'ignore.
      const reached = results.some((r) => r.status === 'fulfilled' || r.reason?.response);
      if (reached) lastSent.current = { lat: reading.lat, lng: reading.lng, at: Date.now(), readingAt: reading.at };
      setState((prev) => ({
        ...prev,
        status: reached ? 'sharing' : 'error',
        lastSentAt: reached ? Date.now() : prev.lastSentAt,
        coords: { lat: reading.lat, lng: reading.lng },
        accuracy: reading.accuracy,
      }));
    }

    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      keepScreenOn(); // le verrou est perdu quand l'application passe en arrière-plan
      flush();
    };

    keepScreenOn();
    const timer = setInterval(flush, SEND_EVERY_MS);
    // Premier envoi dès qu'une lecture existe, sans attendre le premier tour de minuterie.
    const first = setTimeout(flush, 1500);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
