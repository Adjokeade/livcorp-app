/// <reference lib="webworker" />
// Service worker de LIV corp :
//   1. met l'application en cache : elle s'ouvre instantanément et s'affiche même sans réseau ;
//   2. reçoit les notifications push et les affiche, même quand l'app est fermée ;
//   3. ouvre la bonne page de l'app au toucher d'une notification.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

// Une nouvelle version prend la main dès qu'elle est installée (registerType: 'autoUpdate').
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Squelette de l'app (JS, CSS, HTML, icônes) : injecté à la construction.
precacheAndRoute(self.__WB_MANIFEST);

// Toute navigation renvoie l'app (routage côté client), sauf l'API. Hors ligne, l'app s'ouvre donc quand même.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Photos et images du site : servies depuis le cache, rafraîchies en arrière-plan.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

// Tuiles de carte OpenStreetMap : les zones déjà consultées restent affichables hors ligne.
// Réponses "opaques" (cross-origin sans CORS) : statut 0 accepté.
registerRoute(
  ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600, purgeOnQuotaError: true }),
    ],
  }),
);

// L'API (commandes, paiements, position du livreur…) n'est jamais mise en cache : une donnée périmée
// serait pire qu'une erreur claire (statut de paiement, prix, position).

// ---------------------------------------------------------------- Notifications push

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }

  const title = data.title || 'LIV corp';
  const options = {
    body: data.body || '',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/badge-72x72.png', // petite icône monochrome de la barre d'état Android
    lang: 'fr',
    // Même tag = même notification remplacée (ex. plusieurs propositions de prix sur une commande),
    // avec une nouvelle alerte sonore.
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };

  // Un push doit toujours afficher une notification (sinon le navigateur en affiche une générique).
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Le lien vient du serveur avec son propre domaine (FRONTEND_URL) : on ne garde que le chemin
  // pour rester sur l'origine de l'application réellement ouverte.
  let path = '/';
  try {
    const target = new URL(event.notification.data?.url || '/', self.location.origin);
    path = target.pathname + target.search + target.hash;
  } catch {
    // lien invalide : on ouvre l'accueil
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);

      if (open) {
        // App déjà ouverte : on la met au premier plan et on lui demande de changer de page (sans rechargement).
        try {
          await open.focus();
        } catch {
          // certains navigateurs refusent le focus : on change quand même de page
        }
        open.postMessage({ type: 'PUSH_NAVIGATE', path });
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
