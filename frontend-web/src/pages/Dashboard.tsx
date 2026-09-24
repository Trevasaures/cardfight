import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Gamepad2,
  Hammer,
  History,
  Layers3,
  PackageSearch,
  RefreshCcw,
  Swords,
  Target,
  Trophy,
  ArrowUpRight,
} from "lucide-react";

import { useCommandCenterMotion } from "../animations/useCommandCenterMotion";
import { getDashboard } from "../api/dashboard";
import { FormatBadge } from "../components/badges/FormatBadge";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { WorkspaceSectionHeader } from "../components/layout/WorkspaceSectionHeader";
import type {
  AcquisitionPlan,
  DashboardActivity,
  DashboardAttentionItem,
  DashboardDeckVersionBrief,
  DashboardResponse,
  DashboardTestingFocus,
  RandomMatchupResponse,
} from "../types/api";
import { formatPercent, formatRecord } from "../utils/format";

type CommandStyle = CSSProperties & {
  "--command-primary": string;
  "--command-rgb": string;
};

const NATION_THEME: Record<string, { primary: string; rgb: string }> = {
  "Dragon Empire": { primary: "#fb7185", rgb: "251 113 133" },
  "Dark States": { primary: "#a78bfa", rgb: "167 139 250" },
  "Brandt Gate": { primary: "#67e8f9", rgb: "103 232 249" },
  "Keter Sanctuary": { primary: "#facc15", rgb: "250 204 21" },
  Stoicheia: { primary: "#4ade80", rgb: "74 222 128" },
  "Lyrical Monasterio": { primary: "#f9a8d4", rgb: "249 168 212" },
};

const DEFAULT_THEME = { primary: "#67e8f9", rgb: "103 232 249" };

const ATTENTION_TONES = {
  warning: "border-amber-300/20 bg-amber-300/[0.055] text-amber-100",
  accent: "border-violet-300/20 bg-violet-300/[0.055] text-violet-100",
  positive: "border-emerald-300/20 bg-emerald-300/[0.055] text-emerald-100",
  neutral: "border-white/10 bg-white/[0.035] text-slate-200",
};

const PLAN_STATUS: Record<string, string> = {
  planning: "Planning",
  buying: "Buying",
  waiting: "Waiting for delivery",
  complete: "Complete",
  paused: "Paused",
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function shortDate(value: string | null) {
  if (!value) return "Not tested yet";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeDate(value: string | null) {
  if (!value) return "No timestamp";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.floor(delta / 60_000), 0);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return shortDate(value);
}

function persist(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Resume links still navigate correctly if storage is unavailable.
  }
}

function prepareDeckBuilder(
  version: Pick<DashboardDeckVersionBrief, "deck_id" | "id">,
) {
  persist("cardfight.deck-builder.selected-deck", String(version.deck_id));
  persist("cardfight.deck-builder.selected-version", String(version.id));
}

function prepareOrderTracker(planId: number) {
  persist("cardfight.order-tracker.selected-plan", planId);
}

function prepareTesting(focus: DashboardTestingFocus) {
  const opponent = focus.suggested_opponent;
  persist("cardfight.play-lab.mode", "custom");
  persist(
    "cardfight.play-lab.format",
    opponent && opponent.type !== focus.deck.type ? "Any" : focus.deck.type,
  );
  persist("cardfight.play-lab.custom-deck-one", focus.deck.id);
  persist("cardfight.play-lab.custom-deck-two", opponent?.id ?? "");
  persist("cardfight.play-lab.winner", null);
  persist("cardfight.play-lab.first-player", focus.deck.id);

  if (opponent) {
    persist("cardfight.play-lab.matchup", {
      deck1: focus.deck,
      deck2: opponent,
      first_player: focus.deck,
      format: opponent.type === focus.deck.type ? focus.deck.type : "Any",
    });
  }
}

function readMatchDraft() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("cardfight.play-lab.matchup");
    if (!raw) return null;
    const matchup = JSON.parse(raw) as RandomMatchupResponse | null;
    if (!matchup?.deck1 || !matchup.deck2) return null;
    const notesRaw = window.localStorage.getItem("cardfight.play-lab.notes");
    const notes = notesRaw ? (JSON.parse(notesRaw) as string) : "";
    return { matchup, notes };
  } catch {
    return null;
  }
}

function attentionIcon(kind: DashboardAttentionItem["kind"]) {
  if (kind === "purchase") return <PackageSearch className="h-4 w-4" />;
  if (kind === "build") return <Hammer className="h-4 w-4" />;
  if (kind === "testing") return <Gamepad2 className="h-4 w-4" />;
  return <History className="h-4 w-4" />;
}

function activityIcon(kind: DashboardActivity["kind"]) {
  if (kind === "match") return <Swords className="h-4 w-4" />;
  if (kind === "version") return <Layers3 className="h-4 w-4" />;
  return <CircleDollarSign className="h-4 w-4" />;
}

function ReadinessRing({ progress, complete }: { progress: number; complete: boolean }) {
  const percentage = Math.round(progress * 100);
  const offset = 100 - percentage;

  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
        <circle cx="21" cy="21" r="16" pathLength="100" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="3" />
        <circle
          cx="21"
          cy="21"
          r="16"
          pathLength="100"
          fill="none"
          stroke={complete ? "#34d399" : "#67e8f9"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-200">
        {percentage}%
      </span>
    </div>
  );
}

function ResumeBuildCard({ version }: { version: DashboardDeckVersionBrief | null }) {
  if (!version) {
    return (
      <Link to="/deck-builder" data-command="resume" className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
        <Hammer className="h-5 w-5 text-cyan-200" />
        <h4 className="mt-4 font-black text-white">New deck</h4>

      </Link>
    );
  }

  return (
    <Link
      to="/deck-builder"
      onClick={() => prepareDeckBuilder(version)}
      data-command="resume"
      className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-cyan-200/75"><Hammer className="h-3.5 w-3.5" /> Build</p>
          <h4 className="mt-2 truncate text-lg font-black text-white">{version.deck.name}</h4>
          <p className="mt-1 truncate text-xs text-slate-400">{version.version_name} · {version.unique_card_count} unique cards</p>
        </div>
        <ReadinessRing progress={version.progress} complete={version.is_complete} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs">
        <span className={version.is_complete ? "font-bold text-emerald-200" : "text-slate-400"}>{version.is_complete ? "Build ready" : version.issues[0] ?? "Continue deck list"}</span>
        <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-200" />
      </div>
    </Link>
  );
}

function ResumePurchaseCard({ plan }: { plan: AcquisitionPlan | null }) {
  if (!plan) {
    return (
      <Link to="/order-tracker" data-command="resume" className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-4 transition hover:border-violet-300/25 hover:bg-violet-300/[0.04]">
        <PackageSearch className="h-5 w-5 text-violet-200" />
        <h4 className="mt-4 font-black text-white">New purchase plan</h4>

      </Link>
    );
  }

  const progress = Math.round(plan.summary.progress * 100);
  return (
    <Link
      to="/order-tracker"
      onClick={() => prepareOrderTracker(plan.id)}
      data-command="resume"
      className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-violet-300/15 bg-violet-300/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-violet-300/30 hover:bg-violet-300/[0.06]"
    >
      <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-violet-200/75"><PackageSearch className="h-3.5 w-3.5" /> Orders</p>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-lg font-black text-white">{plan.name}</h4>
          <p className="mt-1 text-xs text-slate-400">{PLAN_STATUS[plan.status]} · {plan.summary.missing_quantity} copies missing</p>
        </div>
        <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs font-black text-violet-100">{progress}%</span>
      </div>
      <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" style={{ width: `${progress}%` }} /></div>
      <div className="flex items-center justify-between text-xs"><span className="font-bold text-slate-300">{dollars(plan.summary.remaining_cost_cents)} remaining</span><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-violet-200" /></div>
    </Link>
  );
}

function PlayDraftCard({ draft }: { draft: ReturnType<typeof readMatchDraft> }) {
  return (
    <Link to="/play" data-command="resume" className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.03] p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/30 hover:bg-emerald-300/[0.055]">
      <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-emerald-200/75"><Gamepad2 className="h-3.5 w-3.5" /> {draft ? "Draft" : "Play Lab"}</p>
      {draft ? (
        <>
          <h4 className="mt-2 truncate text-lg font-black text-white">{draft.matchup.deck1.name} <span className="text-slate-600">vs</span> {draft.matchup.deck2.name}</h4>
          {draft.notes.trim() ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{draft.notes}</p> : null}
        </>
      ) : (
        <>
          <h4 className="mt-2 text-lg font-black text-white">New match</h4>

        </>
      )}
      <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-3 text-xs font-bold text-emerald-100"><span>{draft ? "Resume" : "Play"}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
    </Link>
  );
}

export function Dashboard() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const localDraft = useMemo(() => readMatchDraft(), []);

  useCommandCenterMotion(rootRef, Boolean(data));

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load command center"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  if (loading) {
    return (
      <>
        <PageHeader title="Loading dashboard…" />
        <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]" />)}</div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <p role="alert" className="mb-4 text-sm text-slate-400">Dashboard unavailable.</p>
        <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 font-bold text-slate-200"><RefreshCcw className="h-4 w-4" /> Retry</button>
      </>
    );
  }

  const command = data.command_center;
  const focus = command.testing_focus;
  const theme = NATION_THEME[focus?.deck.nation ?? ""] ?? DEFAULT_THEME;
  const commandStyle: CommandStyle = {
    "--command-primary": theme.primary,
    "--command-rgb": theme.rgb,
  };
  const readyBuilds = command.build_readiness.filter((version) => version.is_complete).length;

  return (
    <div ref={rootRef} style={commandStyle}>
      <PageHeader title="Dashboard" />

      <div className="dashboard-stage">
        <article data-command="hero" className="arena-hero">
          <img className="arena-art" src="/art/eclipse-arena.png" alt="" fetchPriority="high" />
          <div className="arena-shade" />
          <div className="arena-content" data-command="hero-item">

            <h3>Stand up.<br /><em>Vanguard.</em></h3>

            <div className="arena-actions"><Link to="/play" className="cinema-button"><Swords size={16} /> Enter Play Lab <ArrowUpRight size={15} /></Link><Link to="/deck-builder" className="arena-secondary">Build a deck <ArrowRight size={15} /></Link></div>
          </div>

        </article>
        <aside className="testing-feature" data-command="hero-item">
          <div className="testing-feature-label"><Target size={14} /> NEXT MATCH</div>
          {focus ? <>
            <div className="testing-emblem">{focus.deck.nation_icon ? <img src={`/nations/${focus.deck.nation_icon}`} alt="" /> : <Swords size={48} strokeWidth={1} />}</div>
            <div className="testing-identity"><FormatBadge type={focus.deck.type} /><span>{focus.deck.nation ?? "Your next contender"}</span></div>
            <h3>{focus.deck.name}</h3>
            <p className="testing-description">{focus.active_version_matches} active-version matches</p>
            <div className="testing-record"><div><strong>{formatPercent(focus.record.win_pct)}</strong><span>Win rate</span></div><div><strong>{formatRecord(focus.record.wins, focus.record.losses)}</strong><span>Match record</span></div><div className="testing-form">{focus.recent_results.slice(0, 4).map((result, index) => <span className={result === "W" ? "form-win" : "form-loss"} key={index}>{result}</span>)}</div></div>
            <Link to="/play" onClick={() => prepareTesting(focus)} className="testing-cta">{focus.suggested_opponent ? `Test vs ${focus.suggested_opponent.name}` : "Start testing"}<ArrowRight size={16} /></Link>
            <span className="testing-last">Last tested {shortDate(focus.last_tested_at)}</span>
          </> : <div className="testing-empty"><Trophy size={36} strokeWidth={1} /><h3>Ready to play?</h3><p>No active decks.</p><Link to="/decks" className="cinema-button">Create a deck <ArrowRight size={16} /></Link></div>}
        </aside>
      </div>

      <section className="lab-metrics" aria-label="Lab overview">
        {[
          { label: "Active decks", value: data.summary.active_decks, icon: Layers3, to: "/decks" },
          { label: "Matches played", value: data.summary.total_matches, icon: Swords, to: "/matches" },
          { label: "Builds ready", value: readyBuilds, icon: CheckCircle2, to: "/deck-builder" },
          { label: "Unresolved", value: data.summary.undecided_matches, icon: History, to: "/matches" },
        ].map(({ label, value, icon: Icon, to }) => <Link to={to} key={label} className="lab-metric"><span className="metric-icon"><Icon size={18} strokeWidth={1.5} /></span><div><p>{label}</p><strong>{value.toString().padStart(2, "0")}</strong></div><ArrowUpRight className="metric-arrow" size={14} /></Link>)}
      </section>

      <section className="nation-explorer" aria-label="Explore nations">
        <h3>Nations</h3>
        <div className="nation-links">{[
          ["Dragon Empire", "dragon_empire.png", "#e87872"],
          ["Dark States", "dark_states.png", "#b897ed"],
          ["Brandt Gate", "brandt_gate.png", "#8ac9e2"],
          ["Keter Sanctuary", "keter_sanctuary.png", "#e7c77e"],
          ["Stoicheia", "stoicheia.png", "#81c29a"],
          ["Lyrical Monasterio", "lyrical_monasterio.png", "#e19fc2"],
        ].map(([name, icon, color]) => <Link to={`/decks?nation=${encodeURIComponent(name)}`} key={name} style={{ "--nation-color": color } as CSSProperties}><img src={`/nations/${icon}`} alt="" /><span>{name}</span><ArrowUpRight size={12} /></Link>)}</div>
      </section>

      <section className="workspace-panel mt-4">
        <WorkspaceSectionHeader title="Continue" className="mb-4" />
        <div className="grid gap-4 xl:grid-cols-3"><ResumeBuildCard version={command.resume.deck_version} /><ResumePurchaseCard plan={command.resume.purchase_plan} /><PlayDraftCard draft={localDraft} /></div>
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
        <section data-command="panel" className="workspace-panel">
          <WorkspaceSectionHeader title="Attention" actions={<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-slate-400">{command.attention.length}</span>} />
          {command.attention.length ? <div className="mt-4 grid gap-2">{command.attention.map((item) => <Link key={item.key} to={item.to} onClick={() => { if (item.kind === "build" && item.deck_id && item.version_id) prepareDeckBuilder({ deck_id: item.deck_id, id: item.version_id }); if (item.kind === "purchase" && item.plan_id) prepareOrderTracker(item.plan_id); if (item.kind === "testing" && focus) prepareTesting(focus); }} data-command="attention" className={`group flex min-w-0 flex-col gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${ATTENTION_TONES[item.tone]}`}><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/15 bg-black/15">{attentionIcon(item.kind)}</span><div><h4 className="font-black text-white">{item.title}</h4>{item.kind === "purchase" || item.kind === "build" ? <p className="mt-1 text-sm leading-6 text-slate-400">{item.body}</p> : null}</div></div><span className="shrink-0 text-sm font-black">{item.value}</span></div></Link>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-emerald-300/15 bg-emerald-300/[0.025] p-8 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-300" /><p className="mt-3 font-black text-slate-200">All clear</p></div>}
        </section>

        <section data-command="panel" className="workspace-panel">
          <WorkspaceSectionHeader title="Active builds" />
          <div className="mt-4 space-y-2">{command.build_readiness.length ? command.build_readiness.map((version) => <Link key={version.id} to="/deck-builder" onClick={() => prepareDeckBuilder(version)} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.04]"><ReadinessRing progress={version.progress} complete={version.is_complete} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate font-black text-white">{version.deck.name}</h4><FormatBadge type={version.deck.type} /></div><p className="mt-1 truncate text-xs text-slate-400">{version.version_name} · {version.main_deck_count} main · {version.ride_deck_count} ride</p><p className={`mt-2 text-xs font-bold ${version.is_complete ? "text-emerald-200" : "text-amber-200/80"}`}>{version.is_complete ? "Ready" : version.issues[0] ?? "Needs review"}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-700 transition group-hover:translate-x-1 group-hover:text-cyan-200" /></Link>) : <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No active versions yet.</p>}</div>
        </section>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
        <section data-command="panel" className="workspace-panel">
          <WorkspaceSectionHeader title="Activity" actions={<Link to="/matches" className="workspace-button border border-white/10 text-xs text-slate-300 hover:bg-white/5">Open history <ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <div className="mt-4 divide-y divide-white/[0.07]">{command.activity.length ? command.activity.map((event) => <Link key={event.id} to={event.to} onClick={() => { if (event.kind === "version" && event.deck_id && event.version_id) prepareDeckBuilder({ deck_id: event.deck_id, id: event.version_id }); if (event.kind === "purchase" && event.plan_id) prepareOrderTracker(event.plan_id); }} data-command="activity" className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 group-hover:text-cyan-200">{activityIcon(event.kind)}</span><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-200 group-hover:text-white">{event.title}</p><p className="mt-0.5 truncate text-sm text-slate-600">{event.detail}</p></div><span className="shrink-0 text-xs font-bold text-slate-600">{relativeDate(event.timestamp)}</span></Link>) : <p className="py-8 text-center text-sm text-slate-500">No activity yet.</p>}</div>
        </section>

        <aside data-command="panel" className="workspace-panel">
          <WorkspaceSectionHeader title="Highlights" />
          <div className="mt-4 grid gap-3">
            <div><p className="text-xs font-bold text-slate-600">Best win rate</p>{data.best_win_rate_deck ? <><p className="mt-1 text-lg font-black text-white">{data.best_win_rate_deck.deck.name}</p><p className="mt-1 text-sm text-emerald-200">{formatRecord(data.best_win_rate_deck.wins, data.best_win_rate_deck.losses)} · {formatPercent(data.best_win_rate_deck.win_pct)}</p></> : <p className="mt-2 text-sm text-slate-500">No decided games yet</p>}</div>
            <div className="border-t border-white/10 pt-3"><p className="text-xs font-bold text-slate-600">Most tested deck</p>{data.most_played_deck ? <><p className="mt-1 text-lg font-black text-white">{data.most_played_deck.deck.name}</p><p className="mt-1 text-sm text-cyan-200">{data.most_played_deck.logged_games} logged games</p></> : <p className="mt-2 text-sm text-slate-500">No matches yet</p>}</div>
            <div className="border-t border-white/10 pt-3"><p className="text-xs font-bold text-slate-600">Open result logs</p><div className="mt-2 flex items-end justify-between"><p className="text-3xl font-black text-white">{data.summary.undecided_matches}</p><CalendarClock className="h-5 w-5 text-slate-700" /></div></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
