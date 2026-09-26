import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
// CSS de Leaflet (react-leaflet en dépend pour positionner tuiles, marqueurs
// et contrôles) : sans cet import, les cartes s'affichent cassées partout.
import 'leaflet/dist/leaflet.css';
import './styles/index.css';
// Capte dès le démarrage l'événement d'installation de l'application (il peut arriver avant React).
import './lib/pwa';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Service worker : cache de l'app, hors ligne, notifications push. Sans effet avec `npm run dev`
// (PWA_DEV=true pour l'activer). Mise à jour automatique à la publication d'une nouvelle version.
registerSW({ immediate: true });
