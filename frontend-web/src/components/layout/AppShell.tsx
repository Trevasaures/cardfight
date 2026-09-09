import { useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Gamepad2,
  Hammer,
  History,
  Home,
  LibraryBig,
  ShoppingCart,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";

import { useRoutePageReveal } from "../../animations/useRoutePageReveal";

const navGroups = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: Home }],
  },
  {
    label: "Cards & Decks",
    items: [
      { to: "/decks", label: "Deck Library", icon: BookOpen },
      { to: "/cards", label: "Card Library", icon: LibraryBig },
      { to: "/deck-builder", label: "Deck Builder", icon: Hammer },
      { to: "/order-tracker", label: "Order Tracker", icon: ShoppingCart },
    ],
  },
  {
    label: "Play Tools",
    items: [
      { to: "/play", label: "Play Lab", icon: Gamepad2 },
      { to: "/nation-quiz", label: "Nation Quiz", icon: Sparkles },
    ],
  },
  {
    label: "History & Stats",
    items: [
      { to: "/matches", label: "Match History", icon: History },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/rivalries", label: "Rivalries", icon: Swords },
    ],
  },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLElement | null>(null);

  useRoutePageReveal(pageRef, location.pathname);

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 hidden h-screen w-72 overflow-auto border-r border-white/10 bg-slate-950/70 px-4 py-5 backdrop-blur-xl lg:block">
        <div className="mb-6 px-1">
          <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10">
            <Trophy className="h-5 w-5 text-cyan-200" />
          </div>

          <h1 className="text-lg font-bold tracking-tight">
            Cardfight Lab
          </h1>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-400">
            Vanguard match tracker and deck testing hub.
          </p>
        </div>

        <nav aria-label="Main navigation" className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-600">
                {group.label}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        [
                          "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-cyan-300",
                          isActive
                            ? "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/20"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                        ].join(" ")
                      }
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <nav aria-label="Mobile navigation" className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/70 px-4 py-3 lg:hidden">
        <span className="flex shrink-0 items-center gap-2 text-sm font-black text-slate-100">
          <Trophy aria-hidden="true" className="h-5 w-5 text-cyan-200" />
          Cardfight Lab
        </span>
        <select aria-label="Navigate to" value={location.pathname} onChange={(event) => navigate(event.target.value)} className="workspace-control w-40 text-xs">
          {navGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => <option key={item.to} value={item.to}>{item.label}</option>)}
            </optgroup>
          ))}
        </select>
      </nav>

      <main
        ref={pageRef}
        key={location.pathname}
        className="min-h-screen px-4 py-6 sm:px-6 lg:ml-72 lg:px-8"
      >
        <Outlet />
      </main>
    </div>
  );
}
