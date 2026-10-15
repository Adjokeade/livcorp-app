import { useEffect, useState } from 'react';
import clientOrderService from '../../services/clientOrderService';

// Case « d'abord à mes livreurs favoris ». N'apparaît que si l'expéditeur a déjà des favoris.
export default function FavoritesFirstOption({ checked, onChange }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    clientOrderService.listFavorites().then((list) => setCount(list.length)).catch(() => {});
  }, []);

  if (count === 0) return null;

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant p-3">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold">Proposer d'abord à mes livreurs favoris ({count})</span>
        <span className="block text-xs text-on-surface-variant">
          Pendant 10 minutes, seuls vos favoris voient la livraison. Sans réponse, elle s'ouvre à tous les livreurs.
        </span>
      </span>
    </label>
  );
}
