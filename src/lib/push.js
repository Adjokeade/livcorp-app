import api from './api';
import { isIos, isStandalone } from './pwa';

// Notifications push (Web Push). Le navigateur crée un abonnement propre à l'appareil, que l'on
// enregistre côté serveur : c'est lui qui enverra les notifications, même application fermée.
//
// États possibles :
//   unsupported  : navigateur sans notifications push
//   needs-install: iPhone/iPad, où les notifications n'existent que pour l'app installée sur l'écran d'accueil
//   blocked      : permission refusée par l'utilisateur dans le navigateur
//   unavailable  : service worker absent (mode développement) ou push non configuré sur le serveur
//   off          : possible mais pas encore activé
//   on           : activé sur cet appareil

let configPromise = null;
function getConfig() {
  if (!configPromise) {
    configPromise = api
      .get('/push/config')
      .then((r) => r.data)
      .catch((err) => {
        configPromise = null; // permet de réessayer
        throw err;
      });
  }
  return configPromise;
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// null si aucun service worker n'est enregistré (ex. `npm run dev`) : `ready` ne se résoudrait jamais.
async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ? navigator.serviceWorker.ready : null;
}

function base64UrlToBytes(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function sameKey(buffer, bytes) {
  if (!buffer) return false;
  const current = new Uint8Array(buffer);
  return current.length === bytes.length && current.every((byte, i) => byte === bytes[i]);
}

export async function getPushStatus() {
  if (!isPushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';

  try {
    const config = await getConfig();
    const reg = await registration();
    if (!config.enabled || !reg) return 'unavailable';
    const subscription = await reg.pushManager.getSubscription();
    return Notification.permission === 'granted' && subscription ? 'on' : 'off';
  } catch {
    return 'unavailable';
  }
}

// Crée (ou retrouve) l'abonnement du navigateur puis l'enregistre pour l'utilisateur connecté.
async function ensureSubscribed() {
  const [config, reg] = await Promise.all([getConfig(), registration()]);
  if (!config.enabled || !reg) throw new Error('unavailable');

  const key = base64UrlToBytes(config.public_key);
  let subscription = await reg.pushManager.getSubscription();

  // Clés VAPID changées côté serveur : l'ancien abonnement ne fonctionnerait plus, on le refait.
  if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }

  const { endpoint, keys } = subscription.toJSON();
  await api.post('/push/subscriptions', {
    endpoint,
    keys,
    contentEncoding: (window.PushManager.supportedContentEncodings ?? []).includes('aes128gcm') ? 'aes128gcm' : 'aesgcm',
  });
}

// À appeler depuis un geste de l'utilisateur (clic) : le navigateur refuse sinon d'afficher la demande.
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') throw new Error('blocked');
  if (permission !== 'granted') throw new Error('dismissed');
  await ensureSubscribed();
}

// À chaque connexion : un même appareil peut servir successivement à plusieurs comptes, il faut donc
// rattacher son abonnement (déjà autorisé) à l'utilisateur qui vient de se connecter.
export async function syncPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    await ensureSubscribed();
  } catch {
    // push indisponible ou service injoignable : sans conséquence pour la session
  }
}

// À la déconnexion, tant que le jeton est encore valide : l'appareil ne doit plus recevoir les
// notifications du compte qui vient de se déconnecter. L'abonnement du navigateur est conservé
// pour se rattacher instantanément à la prochaine connexion.
export async function detachPushFromServer() {
  try {
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) await api.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } });
  } catch {
    // hors ligne : le serveur nettoiera l'abonnement à son prochain refus
  }
}

export async function disablePush() {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe();
}
