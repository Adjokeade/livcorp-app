import { useOnline } from '../../lib/pwa';

// Bandeau affiché quand l'appareil perd le réseau : l'application reste ouverte (mise en cache) mais
// les commandes, paiements et suivis ont besoin de la connexion.
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div role="status" className="bg-on-surface px-4 py-2 text-center text-sm font-semibold text-surface">
      Vous êtes hors ligne. Vos actions reprendront dès le retour du réseau.
    </div>
  );
}
