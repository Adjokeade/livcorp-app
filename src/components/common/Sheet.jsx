import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

// Fiche modale : panneau qui monte du bas de l'écran sur téléphone, fenêtre centrée sur ordinateur.
// Accessible : rôle dialog, focus piégé dans la fiche puis rendu au bouton d'origine, fermeture par Échap,
// clic sur le fond ou bouton ×, et défilement de la page bloqué derrière.
export default function Sheet({ open, onClose, title, subtitle, children, footer }) {
  const panelRef = useRef(null);
  const titleId = useId();
  // La fiche se re-rend à chaque relecture des données : on garde la dernière fonction sans relancer l'effet.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const returnTo = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (panelRef.current?.querySelector('[data-autofocus]') ?? panelRef.current)?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="sheet-overlay absolute inset-0 bg-black/50" onMouseDown={() => closeRef.current()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest shadow-modal outline-none sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>}
          </div>
          <button
            type="button"
            data-autofocus
            onClick={() => closeRef.current()}
            aria-label="Fermer"
            className="-mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-2xl leading-none text-on-surface-variant transition hover:bg-surface-container"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

        {footer && (
          <div
            className="border-t border-outline-variant bg-surface-container-lowest px-4 py-3 sm:px-6"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
