// Photo de profil, ou pastille avec l'initiale tant qu'il n'y en a pas (ou si l'image ne charge pas).
export default function Avatar({ src, name, size = 'md', className = '' }) {
  const sizes = { sm: 'h-9 w-9 text-sm', md: 'h-12 w-12 text-lg', lg: 'h-20 w-20 text-3xl', xl: 'h-28 w-28 text-4xl' };
  const base = `${sizes[size] ?? sizes.md} shrink-0 rounded-full ${className}`;

  if (src) {
    return <img src={src} alt={name ? `Photo de ${name}` : 'Photo de profil'} className={`${base} bg-surface-container object-cover`} />;
  }

  return (
    <div className={`${base} flex items-center justify-center bg-secondary-fixed font-display font-bold text-on-secondary-fixed`} aria-hidden="true">
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}
