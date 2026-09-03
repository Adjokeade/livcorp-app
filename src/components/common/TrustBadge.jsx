// Badge de confiance — cf. DESIGN.md "Components > Trust Badges" et exigence
// "hyper humaine" (§5 du prompt) : afficher note + nb de livraisons du livreur.
export default function TrustBadge({ children, icon = '✓' }) {
  return (
    <span className="trust-badge">
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}
