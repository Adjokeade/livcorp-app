// Boutons — cf. DESIGN.md "Components > Buttons".
// variant: 'primary' (orange, CTA) | 'secondary' (contour bleu) | 'tertiary' (texte souligné)
export default function Button({ variant = 'primary', className = '', children, ...props }) {
  const base =
    variant === 'secondary' ? 'btn-secondary' : variant === 'tertiary' ? 'btn-tertiary' : 'btn-primary';

  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  );
}
