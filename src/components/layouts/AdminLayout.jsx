import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useNoIndex from '../../hooks/useNoIndex';
import adminService from '../../services/adminService';
import NotificationPrompt from '../pwa/NotificationPrompt';
import NotificationSettings from '../pwa/NotificationSettings';
import OfflineBanner from '../pwa/OfflineBanner';

// Menu horizontal de l'administration. `badge` : clé du compteur d'éléments en attente d'une action.
const MENU = [
  { to: '/admin', label: 'Tableau de bord', end: true },
  { to: '/admin/livreurs', label: 'Livreurs', badge: 'pending_deliverers' },
  { to: '/admin/utilisateurs', label: 'Utilisateurs' },
  { to: '/admin/prestataires', label: 'Prestataires', badge: 'pending_providers' },
  { to: '/admin/demandes-service', label: 'Demandes de service' },
  { to: '/admin/livraisons', label: 'Livraisons' },
  { to: '/admin/litiges', label: 'Litiges', badge: 'open_disputes' },
  { to: '/admin/messages', label: 'Messages', badge: 'new_messages' },
  { to: '/admin/taches', label: 'Tâches' },
  { to: '/admin/finances', label: 'Finances' },
  { to: '/admin/tarifs', label: 'Tarifs' },
];

// Cadre de l'espace administrateur : pas de menu du site public (Annonces, Contact…), seulement l'identité de
// la personne connectée, le menu horizontal des sections et la déconnexion.
export default function AdminLayout() {
  useNoIndex();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [badges, setBadges] = useState({});
  const menuRef = useRef(null);
  const { pathname } = useLocation();

  // Menu qui défile sur petit écran : l'entrée active doit rester visible.
  useEffect(() => {
    menuRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  // Compteurs du menu : relus à l'arrivée, puis chaque minute (onglet visible) et après chaque action des sections.
  const refreshBadges = useCallback(() => {
    adminService.stats('day').then((s) => setBadges({ pending_deliverers: s.pending_deliverers, open_disputes: s.open_disputes, new_messages: s.new_messages, pending_providers: (s.pending_providers ?? 0) + (s.pending_conciergeries ?? 0) })).catch(() => {});
  }, []);

  useEffect(() => {
    refreshBadges();
    const timer = setInterval(() => !document.hidden && refreshBadges(), 60000);
    return () => clearInterval(timer);
  }, [refreshBadges]);

  async function handleLogout() {
    await logout();
    navigate('/admin/connexion', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <OfflineBanner />
      <header className="sticky top-0 z-30 bg-on-surface text-surface">
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

        {/* Menu horizontal : défile sur un petit écran plutôt que de passer à la ligne. */}
        <nav aria-label="Sections de l'administration" className="border-t border-white/10">
          <ul ref={menuRef} className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
            {MENU.map((item) => {
              const count = item.badge ? badges[item.badge] : 0;
              return (
                <li key={item.to} className="shrink-0">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                        isActive ? 'border-primary text-white' : 'border-transparent text-white/70 hover:text-white'
                      }`
                    }
                  >
                    {item.label}
                    {count > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold leading-none text-on-primary">{count}</span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <NotificationPrompt />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-10 sm:py-10">
        <Outlet context={{ refreshBadges }} />
        <NotificationSettings />
      </main>
    </div>
  );
}
