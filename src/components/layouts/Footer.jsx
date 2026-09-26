import { Link } from 'react-router-dom';
import Reveal from '../common/Reveal';

const FOOTER_COLUMNS = [
  {
    title: 'Profils',
    links: [
      { label: 'Devenir particulier', to: '/inscription?account_type=particulier' },
      { label: 'Devenir entreprise', to: '/inscription?account_type=entreprise' },
      { label: 'Devenir livreur', to: '/inscription/livreur' },
      { label: 'Se connecter', to: '/connexion' },
    ],
  },
  {
    title: 'Assistance',
    links: [
      { label: 'Comment ça marche', to: '/#comment-ca-marche' },
      { label: "Centre d'aide", href: '#' },
      { label: 'Nous contacter', href: 'mailto:contact@livcorp.bj' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: "Conditions d'utilisation", href: '#' },
      { label: 'Politique de confidentialité', href: '#' },
      { label: 'Mentions légales', href: '#' },
    ],
  },
];

const LINK_CLASS =
  'inline-block rounded transition duration-200 hover:translate-x-1 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary';

// Bleu marine de la marque, orange en accent : le "LIV" garde son orange, le "corp" prend un bleu éclairci
// pour rester lisible sur fond sombre. Les colonnes apparaissent l'une après l'autre au défilement.
export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-footer text-footer-text">
      {/* Filet aux couleurs de la marque, dont le dégradé se déplace lentement */}
      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] motion-safe:animate-gradient-pan"
      />
      {/* Halos décoratifs */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-secondary/25 blur-3xl motion-safe:animate-float" />
      <div
        aria-hidden="true"
        style={{ animationDelay: '-2.5s' }}
        className="pointer-events-none absolute -right-20 bottom-8 h-56 w-56 rounded-full bg-primary/15 blur-3xl motion-safe:animate-float"
      />

      <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:grid-cols-2 sm:px-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Reveal>
          <Link to="/" className="flex w-fit items-baseline gap-0.5 font-display text-2xl font-extrabold transition duration-200 hover:scale-105">
            <span className="text-primary">LIV</span>
            <span className="italic text-footer-accent">corp</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-footer-muted">
            La plateforme de livraison de colis et de courses qui connecte le Bénin, un trajet à la fois.
          </p>
          <p className="mt-4 flex flex-col gap-1 text-sm">
            <a href="mailto:contact@livcorp.bj" className={`${LINK_CLASS} w-fit`}>
              contact@livcorp.bj
            </a>
            <a href="tel:+2290146620583" className={`${LINK_CLASS} w-fit`}>
              +229 01 46 62 05 83
            </a>
          </p>
        </Reveal>

        {FOOTER_COLUMNS.map((column, index) => (
          <Reveal key={column.title} delay={120 * (index + 1)}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
              {column.title}
              <span aria-hidden="true" className="mt-2 block h-0.5 w-8 rounded-full bg-primary" />
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to} className={LINK_CLASS}>
                      {link.label}
                    </Link>
                  ) : (
                    <a href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>

      <div className="relative border-t border-white/10 bg-black/15">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-footer-muted sm:flex-row sm:px-10">
          <p>© 2026 LIV corp. Tous droits réservés.</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3.5 py-1.5 font-semibold text-footer-text transition duration-200 hover:border-primary hover:bg-primary hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Haut de page
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:-translate-y-0.5">
              ↑
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
