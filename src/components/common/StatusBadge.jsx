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

export default function StatusBadge({ status }) {
  const entry = STATUS_MAP[status] ?? { label: status, color: 'bg-surface-container text-on-surface-variant' };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${entry.color}`}>
      {entry.label}
    </span>
  );
}
