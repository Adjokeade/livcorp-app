import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clientOrderService from '../../services/clientOrderService';
import Spinner from '../../components/common/Spinner';

// Livreurs favoris : vus en priorité (10 minutes) quand on coche « d'abord à mes favoris » sur une livraison.
export default function Favorites() {
  const [favorites, setFavorites] = useState(null);

  useEffect(() => {
    clientOrderService.listFavorites().then(setFavorites).catch(() => setFavorites([]));
  }, []);

  async function remove(id) {
    await clientOrderService.removeFavorite(id);
    setFavorites((list) => list.filter((f) => f.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Livreurs favoris</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Les livreurs de confiance, partagés avec toute votre équipe. Ajoutez-les depuis le suivi d'une livraison, puis cochez « Proposer d'abord à mes livreurs favoris » en commandant.
        </p>
      </div>

      {favorites === null ? (
        <div className="flex justify-center py-8"><Spinner className="h-8 w-8" /></div>
      ) : favorites.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-8 text-center shadow-card">
          <p className="text-on-surface-variant">Aucun livreur favori pour le moment.</p>
          <Link to="/client/commandes" className="btn-primary mt-4 inline-flex">Voir mes livraisons</Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {favorites.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-card">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-fixed font-display font-bold text-on-secondary-fixed">
                  {f.first_name?.[0] ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{f.first_name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {Number(f.average_rating) > 0 ? `${Number(f.average_rating).toFixed(1)}/5` : 'Nouveau'} · {f.total_deliveries ?? 0} livraison{f.total_deliveries > 1 ? 's' : ''}
                    {f.vehicle_type ? ` · ${f.vehicle_type}` : ''}
                  </p>
                  <p className={`text-xs font-semibold ${f.is_available ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {f.is_available ? 'Disponible' : 'Indisponible'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => remove(f.id)} className="shrink-0 text-sm font-semibold text-error" aria-label={`Retirer ${f.first_name} des favoris`}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
