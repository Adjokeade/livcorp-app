// Statuts calqués exactement sur les constantes Order::STATUS_* du backend
// (app/Models/Order.php) — un seul point de vérité pour libellés humains + couleurs.
const STATUS_MAP = {
  creee: { label: 'Commande créée', color: 'bg-surface-container-high text-on-surface-variant' },
  acceptee: { label: 'Acceptée par le livreur', color: 'bg-secondary-fixed text-on-secondary-fixed' },
  colis_recupere: { label: 'Colis récupéré', color: 'bg-primary-fixed text-on-primary-fixed-variant' },
  en_cours_livraison: { label: 'En route vers vous', color: 'bg-primary-container text-on-primary-container' },
  livree: { label: 'Livrée', color: 'bg-secondary-fixed text-on-secondary-fixed' },
  annulee: { label: 'Annulée', color: 'bg-surface-container text-on-surface-variant' },
  litige: { label: 'En litige', color: 'bg-error-container text-on-error-container' },
};

// Le livreur ne lit pas les libellés comme le client ("vers vous" n'aurait pas de sens pour lui).
const DELIVERER_LABELS = {
  acceptee: 'Acceptée',
  en_cours_livraison: 'En livraison',
};

export default function StatusBadge({ status, forDeliverer = false, className = '' }) {
  const entry = STATUS_MAP[status] ?? { label: status, color: 'bg-surface-container text-on-surface-variant' };
  const label = (forDeliverer && DELIVERER_LABELS[status]) || entry.label;
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${entry.color} ${className}`}>
      {label}
    </span>
  );
}
