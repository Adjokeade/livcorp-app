// Note sur 5 en lecture seule. La valeur (éventuellement décimale, ex. 4.33)
// est arrondie à l'étoile la plus proche ; la valeur exacte reste dans l'aria-label.
export default function Stars({ value, className = '' }) {
  const rounded = Math.round(Number(value) || 0);

  return (
    <span className={`inline-flex ${className}`} role="img" aria-label={`Note : ${Number(value) || 0} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= rounded ? 'text-primary' : 'text-outline-variant'}>
          ★
        </span>
      ))}
    </span>
  );
}
