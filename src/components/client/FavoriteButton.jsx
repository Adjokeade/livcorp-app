import { useEffect, useState } from 'react';
import clientOrderService from '../../services/clientOrderService';

// Ajoute ou retire le livreur d'une livraison des favoris de l'expéditeur (partagés par l'équipe).
export default function FavoriteButton({ order }) {
  const [isFavorite, setIsFavorite] = useState(null);
  const [busy, setBusy] = useState(false);
  const delivererId = order.deliverer?.id;

  useEffect(() => {
    if (!delivererId) return;
    clientOrderService.listFavorites().then((list) => setIsFavorite(list.some((f) => f.id === delivererId))).catch(() => {});
  }, [delivererId]);

  if (!delivererId || isFavorite === null) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (isFavorite) await clientOrderService.removeFavorite(delivererId);
      else await clientOrderService.addFavorite(order.id);
      setIsFavorite(!isFavorite);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isFavorite}
      className={`mt-3 rounded-full border px-3 py-1.5 text-xs font-semibold ${isFavorite ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant' : 'border-outline-variant text-on-surface-variant'}`}
    >
      {isFavorite ? '★ Livreur favori' : '☆ Ajouter aux favoris'}
    </button>
  );
}
