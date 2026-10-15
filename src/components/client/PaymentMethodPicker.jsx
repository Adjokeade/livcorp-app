// Choix du mode de paiement d'une livraison : en ligne maintenant (argent bloqué chez LIV corp jusqu'à la confirmation
// de réception) ou en espèces, remis au livreur quand il récupère le colis.
const OPTIONS = [
  {
    value: 'en_ligne',
    title: 'Payer en ligne maintenant',
    text: 'Mobile Money ou carte. Votre argent reste bloqué en sécurité chez LIV corp jusqu\'à la confirmation de réception : vous êtes remboursé si la livraison est annulée.',
  },
  {
    value: 'especes',
    title: 'Payer en espèces au livreur',
    text: 'Vous remettez le montant au livreur, en main propre, quand il vient récupérer le colis. Il le confirme dans l\'application avant de partir.',
  },
];

export default function PaymentMethodPicker({ value, onChange, price }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">Comment payez-vous{price ? ` ${price}` : ''} ?</legend>
      <div className="mt-2 flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed"
          >
            <input type="radio" name="payment-method" value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} className="mt-1 h-4 w-4 accent-primary" />
            <span>
              <span className="block text-sm font-semibold">{opt.title}</span>
              <span className="block text-xs text-on-surface-variant">{opt.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
