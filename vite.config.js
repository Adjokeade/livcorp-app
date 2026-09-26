import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),

        // PWA : app installable + notifications push. Le service worker est écrit à la main
        // (src/sw.js) car il doit aussi gérer les événements "push" et "notificationclick",
        // ce que le service worker généré automatiquement ne permet pas.
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            registerType: 'autoUpdate',
            injectRegister: false, // enregistré explicitement dans src/main.jsx
            includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32x32.png'],

            manifest: {
                id: '/',
                name: 'LIV corp',
                short_name: 'LIV corp',
                description: 'Livraison de colis et de courses au Bénin : suivez votre livreur en direct et payez à la réception.',
                lang: 'fr',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                orientation: 'portrait',
                background_color: '#f8fafc',
                theme_color: '#f5721e',
                categories: ['business', 'shopping', 'travel'],
                icons: [
                    { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
                // Raccourcis (appui long sur l'icône) vers les deux actions les plus fréquentes.
                shortcuts: [
                    { name: 'Commander une livraison', url: '/client/commander', icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }] },
                    { name: 'Mes commandes', url: '/client/commandes', icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }] },
                ],
            },

            // Seul le "squelette" de l'app est pré-mis en cache. Les photos volumineuses du site sont
            // mises en cache à l'usage (cf. sw.js) pour ne pas alourdir la première installation.
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'icons/{pwa-*,maskable-*,apple-*,favicon-*,badge-*}.png'],
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
            },

            // Le service worker n'est pas actif avec `npm run dev` (il figerait des fichiers
            // pendant le développement). PWA_DEV=true npm run dev pour l'essayer.
            devOptions: { enabled: process.env.PWA_DEV === 'true', type: 'module' },
        }),
    ],

    server: {
        port: 5173,
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
