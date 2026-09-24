import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, BarChart3, BookOpen, ChevronRight, Command, Gamepad2, Hammer, History, Home, LibraryBig, Menu, Search, ShoppingCart, Sparkles, Swords, X } from "lucide-react";
import { useRoutePageReveal } from "../../animations/useRoutePageReveal";

const navGroups = [
  { label: "Your workspace", items: [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/play", label: "Play Lab", icon: Gamepad2 },
  ] },
  { label: "Collection", items: [
    { to: "/decks", label: "Deck Library", icon: BookOpen },
    { to: "/cards", label: "Card Library", icon: LibraryBig },
    { to: "/deck-builder", label: "Deck Builder", icon: Hammer },
    { to: "/order-tracker", label: "Order Tracker", icon: ShoppingCart },
  ] },
  { label: "Insights", items: [
    { to: "/matches", label: "Match History", icon: History },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/rivalries", label: "Rivalries", icon: Swords },
    { to: "/nation-quiz", label: "Nation Quiz", icon: Sparkles },
  ] },
];
const destinations = navGroups.flatMap((group) => group.items);

export function AppShell() {
  const location = useLocation();
  const pageRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = destinations.find((item) => item.to === location.pathname);
  useRoutePageReveal(pageRef, location.pathname);

  useEffect(() => {
    document.title = `${current?.label ?? "Dashboard"} · Cardfight Lab`;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, current?.label]);

  function openSearch() {
    setQuery("");
    dialogRef.current?.showModal();
    searchRef.current?.focus();
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link to="/" className="brand" onClick={() => setMobileOpen(false)} aria-label="Cardfight Lab home">
          <span className="brand-mark"><Swords size={23} strokeWidth={1.5} /></span>
          <span><strong>CARDFIGHT<span className="brand-dot">.</span></strong><small>THE VANGUARD LAB</small></span>
        </Link>

        <nav id="main-navigation" aria-label="Main navigation" className="sidebar-nav">
          {navGroups.map((group) => <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}>
              <Icon size={18} strokeWidth={1.65} /><span>{label}</span><ChevronRight className="nav-chevron" size={14} />
            </NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-footer"><span className="workspace-avatar">CF</span><div><strong>Your personal lab</strong></div></div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <button className="icon-button mobile-toggle" type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="main-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
          <span className="mobile-page-title" aria-hidden="true">{current?.label ?? "Dashboard"}</span>
          <button className="quick-search" type="button" aria-label="Jump to a page" onClick={openSearch}><Search size={16} /><span>Jump to a page...</span><kbd><Command size={11} /> K</kbd></button>
          <Link to="/play" className="topbar-play"><Swords size={16} /><span>Start a match</span><ArrowUpRight size={14} /></Link>
        </header>
        <main id="main-content" aria-labelledby="page-title" tabIndex={-1} ref={pageRef} key={location.pathname} className="app-main"><Outlet /></main>
      </div>
      <dialog ref={dialogRef} className="command-dialog" aria-label="Jump to a page" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
        <div className="command-search"><Search size={20} /><input ref={searchRef} aria-label="Search pages" placeholder="Where would you like to go?" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="icon-button" aria-label="Close search" onClick={() => dialogRef.current?.close()}><X size={18} /></button></div>
        <div className="command-results">{destinations.filter((item) => item.label.toLowerCase().includes(query.toLowerCase().trim())).map(({ to, label, icon: Icon }) => <Link to={to} key={to} onClick={() => { dialogRef.current?.close(); setMobileOpen(false); }}><Icon size={18} /><span>{label}</span><ArrowUpRight size={16} /></Link>)}
          {!destinations.some((item) => item.label.toLowerCase().includes(query.toLowerCase().trim())) && <p className="command-empty">No pages found.</p>}
        </div><div className="command-hint">Tab to navigate <span>Esc to close</span></div>
      </dialog>
    </div>
  );
}
