import { Link } from 'react-router-dom';
import { formatFcfa } from '../../lib/format';

// Carte d'annonce : photo, trajet, distance, prix. Toute la carte est cliquable : elle ouvre la fiche
// détaillée (onOpen) ou une page (to). Même présentation partout : page Annonces, courses du livreur, commandes du client.
export default function AnnouncementCard({
  title,
  meta,
  description,
  photoUrl,
  photoNote, // texte du cadre quand il n'y a pas de photo à montrer
  chips = [],
  corner,
  price,
  priceNote,
  cta = 'Voir le détail',
  onOpen,
  to,
}) {
  const content = (
    <>
      {/* Sans photo, le cadre est bas : un grand rectangle vide alourdirait la liste sans rien dire. */}
      <div className={`relative w-full overflow-hidden bg-surface-container ${photoUrl ? 'aspect-[16/10]' : 'h-24'}`}>
        {photoUrl ? (
          <img src={photoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-fixed to-surface-container px-6 text-center text-xs font-semibold text-on-surface-variant">
            {photoNote}
          </div>
        )}

        {chips.length > 0 && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.label}
                className={`rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${
                  chip.tone === 'primary' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest/95 text-on-surface'
                }`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
        {corner && <div className="absolute right-3 top-3">{corner}</div>}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-base font-bold leading-snug">{title}</h3>
        {meta && <p className="mt-1 text-xs text-on-surface-variant">{meta}</p>}
        {description && <p className="mt-2 line-clamp-2 break-words text-sm">{description}</p>}

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="font-display text-xl font-extrabold leading-none text-primary">{formatFcfa(price)}</p>
            {priceNote && <p className="mt-1 text-xs text-on-surface-variant">{priceNote}</p>}
          </div>
          <span className="flex-shrink-0 text-sm font-semibold text-secondary group-hover:underline">{cta} ›</span>
        </div>
      </div>
    </>
  );

  const classes =
    'group card card-hover flex h-full w-full flex-col overflow-hidden !p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

  return to ? (
    <Link to={to} className={classes}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={classes}>
      {content}
    </button>
  );
}
