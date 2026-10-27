import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Sheet from '../common/Sheet';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../common/Avatar';
import { categoryLabel, menuFor } from '../../lib/navigation';

const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z',
  plus: 'M12 5v14M5 12h14',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  book: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5zM8 7h7M8 11h7',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  team: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M17 11a3 3 0 100-6M18 14.5A6 6 0 0122 20',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Menu latéral sur grand écran, barre fixe en bas sur mobile.
export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const items = menuFor(user);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  if (!user || items.length === 0) return null;

  // Barre du bas : au plus 5 entrées. Au-delà, les 4 principales restent visibles et le reste passe dans « Plus ».
  const crowded = items.length > 5;
  const bar = crowded ? items.filter((i) => i.primary).slice(0, 4) : items;
  const rest = crowded ? items.filter((i) => !bar.includes(i)) : [];
  const restActive = rest.some((i) => pathname.startsWith(i.to));

  const name = user.company_name && ['entreprise', 'conciergerie'].includes(user.account_type) ? user.company_name : `${user.first_name} ${user.last_name}`;

  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block">
        <nav aria-label="Menu principal" className="sticky top-20 rounded-xl bg-surface-container-lowest p-3 shadow-card">
          <div className="mb-2 flex items-center gap-3 border-b border-outline-variant px-3 pb-3">
            <Avatar src={user.avatar_url} name={user.first_name} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{name}</p>
              <p className="text-xs text-on-surface-variant">{categoryLabel(user)}</p>
            </div>
          </div>
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      isActive ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'text-on-surface-variant hover:bg-surface-container'
                    }`
                  }
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <nav
        aria-label="Menu principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-[1200px] justify-around">
          {bar.map((item) => (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${isActive ? 'text-primary' : 'text-on-surface-variant'}`
                }
              >
                <Icon name={item.icon} />
                <span className="max-w-full truncate">{item.short ?? item.label}</span>
              </NavLink>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${restActive ? 'text-primary' : 'text-on-surface-variant'}`}
              >
                <Icon name="more" />
                <span>Plus</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <ul className="flex flex-col gap-1">
          {rest.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-3 text-base font-semibold ${isActive ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'text-on-surface hover:bg-surface-container'}`
                }
              >
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
