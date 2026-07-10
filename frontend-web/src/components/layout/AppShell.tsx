import { useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Gamepad2,
  Hammer,
  History,
  Home,
  LibraryBig,
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
  const pageRef = useRef<HTMLElement | null>(null);

  useRoutePageReveal(pageRef, location.pathname);

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 hidden h-screen w-72 overflow-auto border-r border-white/10 bg-slate-950/70 px-5 py-6 backdrop-blur-xl lg:block">
        <div className="mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10">
            <Trophy className="h-6 w-6 text-cyan-200" />
          </div>

          <h1 className="mt-4 text-xl font-bold tracking-tight">
            Cardfight Lab
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Vanguard match tracker and deck testing hub.
          </p>
        </div>

        <nav className="space-y-6">
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
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
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