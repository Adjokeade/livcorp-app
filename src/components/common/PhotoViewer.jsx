import { useState } from 'react';
import Sheet from './Sheet';

// Photo cliquable : s'affiche en grand dans la page, et s'agrandit en plein cadre au toucher (sans quitter la page).
export default function PhotoViewer({ src, alt = 'Photo du colis', className = 'h-48 sm:h-56' }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Agrandir la photo du colis"
        className={`group relative block w-full overflow-hidden rounded-lg bg-surface-container ${className}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">Agrandir</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={alt}>
        <img src={src} alt={alt} className="mx-auto max-h-[70dvh] w-full rounded-lg bg-surface-container object-contain" />
      </Sheet>
    </>
  );
}
