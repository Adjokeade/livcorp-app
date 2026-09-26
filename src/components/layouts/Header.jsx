import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';
import { ROLE_HOME } from '../../lib/roleHome';

// Logo LIV corp : "LIV" orange vif, "corp" en bleu script — cf. prompt frontend
// "Identité de marque". Doit figurer en en-tête de toutes les interfaces.
function Logo() {
  return (
    <Link to="/" className="flex items-baseline gap-0.5 font-display text-2xl font-extrabold">
      <span className="text-primary">LIV</span>
      <span className="italic text-secondary">corp</span>
    </Link>
  );
}

const NAV_LINKS = [
  { to: '/', label: 'Accueil' },
  { to: '/annonces', label: 'Annonces' },
  { to: '/contact', label: 'Contactez-nous' },
  { to: '/a-propos', label: 'À propos' },
];

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/connexion');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-2 px-4 py-3 sm:px-10">
        <Logo />

        <nav className="hidden items-center gap-6 text-sm font-medium text-on-surface-variant sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link
                to={ROLE_HOME[user.role] ?? '/'}
                className="hidden text-sm font-semibold text-on-surface sm:inline"
              >
                Bonjour, {user.first_name}
              </Link>
              <Button variant="secondary" onClick={handleLogout} className="hidden sm:inline-flex">
                Déconnexion
              </Button>
            </>
          ) : (
            <>
              <Link to="/connexion" className="btn-tertiary hidden sm:inline-flex">
                Connexion
              </Link>
              <Link to="/inscription" className="btn-primary hidden sm:inline-flex">
                Commencer
              </Link>
            </>
          )}

          {/* Bouton menu mobile : la nav et les actions du dessus sont cachées
              en dessous de sm, ce menu est le seul moyen d'y accéder au tactile. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant text-on-surface sm:hidden"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-outline-variant bg-surface px-4 py-4 sm:hidden">
          <ul className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-2 py-2.5 hover:bg-surface-container"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-col gap-2 border-t border-outline-variant pt-3">
            {user ? (
              <>
                <Link
                  to={ROLE_HOME[user.role] ?? '/'}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                >
                  Bonjour, {user.first_name}
                </Link>
                <Button variant="secondary" onClick={handleLogout} className="w-full">
                  Déconnexion
                </Button>
              </>
            ) : (
              <>
                <Link to="/connexion" onClick={() => setMenuOpen(false)} className="btn-secondary w-full">
                  Connexion
                </Link>
                <Link to="/inscription" onClick={() => setMenuOpen(false)} className="btn-primary w-full">
                  Commencer
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
