import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Le suivi temps réel (position GPS livreur + changements de statut) est diffusé
// par le backend via Laravel Reverb (protocole compatible Pusher) sur des canaux
// privés "order.{id}" — cf. app/Events/PrivateOrderChannel.php côté backend.
window.Pusher = Pusher;

let echoInstance = null;

/**
 * Crée (ou réutilise) l'instance Echo, authentifiée avec le token Sanctum courant.
 * Un canal privé Reverb nécessite une autorisation ; on la fait passer par la même
 * API Laravel (broadcasting/auth) avec le Bearer token, pas par des cookies de session.
 */
export function getEcho() {
  if (echoInstance) return echoInstance;

  const token = localStorage.getItem('livcorp_token');

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST ?? 'localhost',
    wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  });

  return echoInstance;
}

/** À appeler à la déconnexion pour fermer proprement le socket et forcer une ré-auth au prochain login. */
export function disconnectEcho() {
  echoInstance?.disconnect();
  echoInstance = null;
}

/**
 * S'abonne au canal privé d'une commande et retourne une fonction de désabonnement.
 * Utilisé par la page de suivi temps réel client (cf. pages/client/OrderTracking.jsx).
 */
export function subscribeToOrder(orderId, { onLocationUpdated, onStatusChanged }) {
  const echo = getEcho();
  const channel = echo.private(`order.${orderId}`);

  if (onLocationUpdated) channel.listen('.order.location.updated', onLocationUpdated);
  if (onStatusChanged) channel.listen('.order.status.changed', onStatusChanged);

  return () => {
    echo.leave(`order.${orderId}`);
  };
}
