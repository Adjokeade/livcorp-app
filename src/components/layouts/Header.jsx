import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';

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

const ROLE_HOME = {
  client: '/client/commander',
  commercant: '/merchant/tableau-de-bord',
  livreur: '/deliverer/tableau-de-bord',
  admin: '/admin',
};

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/connexion');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 sm:px-10">
        <Logo />

        <nav className="hidden items-center gap-6 text-sm font-medium text-on-surface-variant sm:flex">
          <Link to="/client/commander">Client</Link>
          <Link to="/merchant/tableau-de-bord">Merchant</Link>
          <Link to="/deliverer/tableau-de-bord">Delivery</Link>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                to={ROLE_HOME[user.role] ?? '/'}
                className="hidden text-sm font-semibold text-on-surface sm:inline"
              >
                Bonjour, {user.first_name}
              </Link>
              <Button variant="secondary" onClick={handleLogout}>
                Déconnexion
              </Button>
            </>
          ) : (
            <>
              <Link to="/connexion" className="btn-tertiary">
                Sign In
              </Link>
              <Link to="/inscription" className="btn-primary">
                Commencer
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
