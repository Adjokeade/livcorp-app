import { Outlet, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useNoIndex from '../../hooks/useNoIndex';
import NotificationPrompt from '../pwa/NotificationPrompt';
import NotificationSettings from '../pwa/NotificationSettings';
import OfflineBanner from '../pwa/OfflineBanner';

// Cadre de l'espace administrateur : pas de menu du site public (Annonces, Contact…), seulement l'identité de
// la personne connectée et la déconnexion, qui ramène à la connexion administrateur.
export default function AdminLayout() {
  useNoIndex();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/admin/connexion', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <OfflineBanner />
      <header className="bg-on-surface text-surface">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3 sm:px-10">
          <p className="flex items-baseline gap-2 font-display text-xl font-extrabold">
            <span>
              <span className="text-primary">LIV</span> <span className="italic text-[#8fb4ea]">corp</span>
            </span>
            <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest">Administration</span>
          </p>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-white/80 sm:inline">
              {user?.first_name} {user?.last_name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded border border-white/30 px-3 py-1.5 font-semibold transition hover:bg-white/10"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <NotificationPrompt />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-10 sm:py-10">
        <Outlet />
        <NotificationSettings />
      </main>
    </div>
  );
}
