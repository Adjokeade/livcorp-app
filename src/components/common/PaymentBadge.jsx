// Statut de paiement d'une commande. Le paiement se fait à la réception du colis,
// devant le livreur : avant cela, "à la réception" n'est pas un retard mais la règle.
export default function PaymentBadge({ order, className = '' }) {
  let label;
  let color;

  if (order.payment_status === 'paye') {
    label = order.payment_method === 'especes' ? 'Payé en espèces' : 'Payé en ligne';
    color = 'bg-secondary-fixed text-on-secondary-fixed';
  } else if (order.payment_status === 'echoue') {
    label = 'Paiement échoué';
    color = 'bg-error-container text-on-error-container';
  } else if (order.status === 'en_cours_livraison') {
    label = 'Paiement en attente';
    color = 'bg-primary-container text-on-primary-container';
  } else {
    label = 'Paiement à la réception';
    color = 'bg-surface-container-high text-on-surface-variant';
  }

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${color} ${className}`}>
      {label}
    </span>
  );
}
