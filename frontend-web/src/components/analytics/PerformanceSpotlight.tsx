import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CircleGauge,
  Gamepad2,
  Hammer,
  Layers3,
  PackageSearch,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UsersRound,
  Zap,
} from "lucide-react";

import { usePerformanceSpotlightMotion } from "../../animations/usePerformanceSpotlightMotion";
import { FormatBadge } from "../badges/FormatBadge";
import { WorkspaceSectionHeader } from "../layout/WorkspaceSectionHeader";
import { SpotlightMatchDialog } from "./SpotlightMatchDialog";
import type {
  PerformanceRecord,
  PerformanceSpotlightResponse,
  SpotlightInsight,
  SpotlightMatch,
  SpotlightMatchup,
} from "../../types/api";
import { formatPercent, formatRecord } from "../../utils/format";

type PerformanceSpotlightProps = {
  spotlight: PerformanceSpotlightResponse;
};

type SpotlightStyle = CSSProperties & {
  "--spotlight-primary": string;
  "--spotlight-secondary": string;
  "--spotlight-rgb": string;
};

const NATION_THEMES: Record<
  string,
  { primary: string; secondary: string; rgb: string }
> = {
  "Dragon Empire": {
    primary: "#fb7185",
    secondary: "#f97316",
    rgb: "251 113 133",
  },
  "Dark States": {
    primary: "#c084fc",
    secondary: "#7c3aed",
    rgb: "192 132 252",
  },
  "Brandt Gate": {
    primary: "#67e8f9",
    secondary: "#818cf8",
    rgb: "103 232 249",
  },
  "Keter Sanctuary": {
    primary: "#fde68a",
    secondary: "#f8fafc",
    rgb: "253 230 138",
  },
  Stoicheia: {
    primary: "#6ee7b7",
    secondary: "#22d3ee",
    rgb: "110 231 183",
  },
  "Lyrical Monasterio": {
    primary: "#f9a8d4",
    secondary: "#a78bfa",
    rgb: "249 168 212",
  },
};

const DEFAULT_THEME = {
  primary: "#67e8f9",
  secondary: "#a78bfa",
  rgb: "103 232 249",
};

function conciseDate(value: string | null) {
  if (!value) return "No matches yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function compactDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function dateYear(value: string | null) {
  if (!value) return "No history";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date recorded" : String(date.getFullYear());
}

function signedPoints(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function WinRateDial({
  winPct,
  record,
}: {
  winPct: number;
  record: PerformanceRecord;
}) {
  const percentage = Math.max(0, Math.min(winPct * 100, 100));

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[17rem] items-center justify-center">
      <div className="absolute inset-5 rounded-full border border-white/10 bg-slate-950/70 shadow-[inset_0_0_55px_rgba(0,0,0,0.72)]" />
      <svg
        viewBox="0 0 220 220"
        className="absolute inset-0 h-full w-full -rotate-90 overflow-visible"
        role="img"
        aria-label={`${percentage.toFixed(1)} percent win rate`}
      >
        <defs>
          <linearGradient id="spotlight-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--spotlight-primary)" />
            <stop offset="100%" stopColor="var(--spotlight-secondary)" />
          </linearGradient>
          <filter id="spotlight-ring-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="110"
          cy="110"
          r="88"
          pathLength="100"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="10"
        />
        <circle
          data-spotlight-ring
          cx="110"
          cy="110"
          r="88"
          pathLength="100"
          fill="none"
          stroke="url(#spotlight-ring-gradient)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={100 - percentage}
          filter="url(#spotlight-ring-glow)"
        />
      </svg>

      <div className="relative z-10 text-center">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.28em] text-slate-500">
          Decided win rate
        </p>
        <p className="mt-2 bg-gradient-to-br from-white via-white to-[var(--spotlight-primary)] bg-clip-text text-5xl font-black tracking-[-0.075em] text-transparent sm:text-6xl">
          {percentage.toFixed(1)}
          <span className="ml-1 text-2xl tracking-normal">%</span>
        </p>
        <p className="mt-2 text-xs font-bold text-slate-300">
          {formatRecord(record.wins, record.losses)} across {record.decided_games} games
        </p>
      </div>
    </div>
  );
}

function MetricTile({
  icon,
  eyebrow,
  value,
  helper,
}: {
  icon: ReactNode;
  eyebrow: string;
  value: string;
  helper: string;
}) {
  return (
    <div
      data-spotlight="metric"
      className="workspace-inset min-w-0 p-3 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 text-[var(--spotlight-primary)]">
        {icon}
        <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-500">
          {eyebrow}
        </p>
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function TurnOrderCard({
  label,
  record,
  accent,
}: {
  label: string;
  record: PerformanceRecord;
  accent: "primary" | "secondary";
}) {
  const percentage = record.win_pct * 100;
  const color =
    accent === "primary" ? "var(--spotlight-primary)" : "var(--spotlight-secondary)";

  return (
    <div className="workspace-inset min-w-0 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">
            {formatPercent(record.win_pct)}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-bold text-slate-300">
          {formatRecord(record.wins, record.losses)}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full shadow-[0_0_18px_currentColor] transition-[width] duration-700"
          style={{ width: `${percentage}%`, background: color, color }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {record.decided_games
          ? `${record.decided_games} decided games`
          : "No decided games in this split"}
      </p>
    </div>
  );
}

function MatchupCard({
  label,
  matchup,
  tone,
}: {
  label: string;
  matchup: SpotlightMatchup | null;
  tone: "good" | "danger";
}) {
  const isGood = tone === "good";

  return (
    <div className="workspace-inset relative min-w-0 overflow-hidden p-3.5">
      <div
        className={`absolute inset-y-0 left-0 w-1 ${isGood ? "bg-emerald-300" : "bg-rose-300"}`}
      />
      <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      {matchup ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-base font-black text-white">
                {matchup.opponent_name}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {matchup.opponent_nation ?? matchup.opponent_type}
              </p>
            </div>
            <p
              className={`text-2xl font-black ${isGood ? "text-emerald-200" : "text-rose-200"}`}
            >
              {formatPercent(matchup.win_pct)}
            </p>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {formatRecord(matchup.wins, matchup.losses)} · {matchup.decided_games} decided
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Log repeated matchups to reveal this signal.
        </p>
      )}
    </div>
  );
}

const INSIGHT_TONES: Record<SpotlightInsight["tone"], string> = {
  positive: "border-emerald-300/20 bg-emerald-300/[0.055] text-emerald-200",
  warning: "border-amber-300/20 bg-amber-300/[0.055] text-amber-200",
  danger: "border-rose-300/20 bg-rose-300/[0.055] text-rose-200",
  accent: "border-violet-300/20 bg-violet-300/[0.055] text-violet-200",
  neutral: "border-white/10 bg-white/[0.035] text-slate-200",
};

export function PerformanceSpotlight({ spotlight }: PerformanceSpotlightProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<SpotlightMatch | null>(null);
  const { deck, overview, recent_form: recent, turn_order: turnOrder } = spotlight;
  const historyUrl = `/matches?${new URLSearchParams({ q: deck.name })}`;
  const theme = NATION_THEMES[deck.nation ?? ""] ?? DEFAULT_THEME;
  const style: SpotlightStyle = {
    "--spotlight-primary": theme.primary,
    "--spotlight-secondary": theme.secondary,
    "--spotlight-rgb": theme.rgb,
  };
  const nationIcon = deck.nation_icon ? `/nations/${deck.nation_icon}` : null;
  const activeVersion = spotlight.version.active;

  usePerformanceSpotlightMotion(rootRef, deck.id, overview.win_pct * 100);

  function prepareDeckBuilder() {
    window.localStorage.setItem(
      "cardfight.deck-builder.selected-deck",
      JSON.stringify(String(deck.id)),
    );
    if (activeVersion) {
      window.localStorage.setItem(
        "cardfight.deck-builder.selected-version",
        JSON.stringify(String(activeVersion.id)),
      );
    }
  }

  function preparePlayLab() {
    window.localStorage.setItem("cardfight.play-lab.mode", JSON.stringify("custom"));
    window.localStorage.setItem("cardfight.play-lab.format", JSON.stringify(deck.type));
    window.localStorage.setItem(
      "cardfight.play-lab.custom-deck-one",
      JSON.stringify(deck.id),
    );
    window.localStorage.setItem("cardfight.play-lab.matchup", JSON.stringify(null));
    window.localStorage.setItem("cardfight.play-lab.winner", JSON.stringify(null));
    window.localStorage.setItem(
      "cardfight.play-lab.first-player",
      JSON.stringify(null),
    );
  }

  return (
    <section ref={rootRef} style={style} className="space-y-4" aria-live="polite">
      <article
        data-spotlight="hero"
        className="analytics-spotlight relative isolate overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#080b16] shadow-[0_32px_100px_rgba(0,0,0,0.45)]"
      >
        <div data-spotlight="glow" className="spotlight-glow" />
        <div className="spotlight-grid" />
        <div className="relative z-10 p-4 sm:p-5 xl:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div data-spotlight="identity" className="flex min-w-0 items-center gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-white/10 bg-black/35 shadow-[0_0_35px_rgb(var(--spotlight-rgb)/0.16)]">
                {nationIcon ? (
                  <img
                    src={nationIcon}
                    alt=""
                    className="h-11 w-11 object-contain drop-shadow-[0_0_15px_rgb(var(--spotlight-rgb)/0.5)]"
                  />
                ) : (
                  <Trophy className="h-8 w-8 text-[var(--spotlight-primary)]" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.26em] text-[var(--spotlight-primary)]">
                    Performance spotlight
                  </p>
                  <FormatBadge type={deck.type} />
                </div>
                <h3 className="mt-2 truncate text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
                  {deck.name}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {deck.nation ?? "Nation not assigned"}
                  {activeVersion ? ` · ${activeVersion.version_name}` : " · No active version"}
                </p>
              </div>
            </div>

            <div data-spotlight="identity" className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--spotlight-primary)]" />
                {spotlight.sample.label}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-slate-300">
                <UsersRound className="h-3.5 w-3.5 text-[var(--spotlight-secondary)]" />
                {overview.opponents_faced} opponents
              </span>
            </div>
          </div>

          <div className="mt-4 grid items-center gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <div data-spotlight="identity" className="relative">
              <div className="absolute inset-12 rounded-full bg-[rgb(var(--spotlight-rgb)/0.12)] blur-3xl" />
              <WinRateDial winPct={overview.win_pct} record={overview} />
            </div>

            <div>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                <MetricTile
                  icon={
                    recent.trend === "cooling" ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )
                  }
                  eyebrow="Recent form"
                  value={formatRecord(recent.wins, recent.losses)}
                  helper={`${recent.trend_label} · ${signedPoints(recent.delta_percentage_points)}`}
                />
                <MetricTile
                  icon={<Zap className="h-4 w-4" />}
                  eyebrow="Current run"
                  value={spotlight.streak.length ? `${spotlight.streak.result}${spotlight.streak.length}` : "—"}
                  helper={spotlight.streak.label}
                />
                <MetricTile
                  icon={<CircleGauge className="h-4 w-4" />}
                  eyebrow="Going first"
                  value={formatPercent(turnOrder.first.win_pct)}
                  helper={`${formatRecord(turnOrder.first.wins, turnOrder.first.losses)} in ${turnOrder.first.decided_games} decided`}
                />
                <MetricTile
                  icon={<CalendarDays className="h-4 w-4" />}
                  eyebrow="Last tested"
                  value={compactDate(overview.last_match_at)}
                  helper={`${dateYear(overview.last_match_at)} · ${overview.logged_games} logged matches`}
                />
              </div>

              <div className="workspace-inset mt-3 p-3.5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                      Recent decided games
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Oldest to newest · select a result for match details
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">{spotlight.sample.message}</span>
                </div>

                {recent.results.length ? (
                  <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
                    {recent.results.map((result) => (
                      <button
                        key={result.match_id}
                        type="button"
                        data-spotlight="result"
                        onClick={() => setSelectedMatch(result)}
                        aria-haspopup="dialog"
                        aria-label={`View ${deck.name}'s ${result.result === "W" ? "win" : "loss"} against ${result.opponent_name} on ${conciseDate(result.date_played)}`}
                        className={[
                          "group relative flex h-10 cursor-pointer items-center justify-center overflow-hidden rounded-lg border text-sm font-black transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--spotlight-primary)] motion-reduce:transform-none",
                          result.result === "W"
                            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/20"
                            : "border-rose-300/25 bg-rose-300/10 text-rose-200 hover:bg-rose-300/20",
                        ].join(" ")}
                      >
                        {result.result}
                        <span className="absolute inset-x-1 bottom-1 h-0.5 scale-x-0 rounded-full bg-current transition group-hover:scale-x-100" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">
                    Log a decided match to begin the form rail.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <Link
              to="/play"
              onClick={preparePlayLab}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--spotlight-primary)] px-4 py-2.5 text-sm font-black text-slate-950 transition hover:brightness-110"
            >
              <Gamepad2 className="h-4 w-4" />
              Test this deck
            </Link>
            <Link
              to="/deck-builder"
              onClick={prepareDeckBuilder}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.1]"
            >
              <Hammer className="h-4 w-4" />
              Tune active build
            </Link>
            <Link
              to="/order-tracker"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.1]"
            >
              <PackageSearch className="h-4 w-4" />
              Plan purchases
            </Link>
            <Link
              to={historyUrl}
              className="ml-auto inline-flex items-center gap-2 px-2 py-2 text-sm font-bold text-slate-400 transition hover:text-white"
            >
              Open match history
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </article>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section
          data-spotlight="panel"
          className="workspace-panel min-w-0"
        >
          <WorkspaceSectionHeader
            eyebrow="Turn order"
            title="How the deck enters the fight"
            actions={turnOrder.edge_percentage_points !== null ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300">
                {Math.abs(turnOrder.edge_percentage_points).toFixed(1)} pt split
              </span>
            ) : null}
          />

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <TurnOrderCard label="Going first" record={turnOrder.first} accent="primary" />
            <TurnOrderCard label="Going second" record={turnOrder.second} accent="secondary" />
          </div>

          <div className="mt-3 flex items-start gap-2 border-t border-white/10 pt-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--spotlight-primary)]" />
            <p className="text-xs leading-5 text-slate-400">
              {turnOrder.edge_percentage_points === null
                ? "Log decided games from both turn orders to unlock a reliable comparison."
                : Math.abs(turnOrder.edge_percentage_points) < 5
                  ? "Turn order is currently neutral; the two splits are within five percentage points."
                  : `Recorded performance favors going ${turnOrder.edge_percentage_points > 0 ? "first" : "second"} by ${Math.abs(turnOrder.edge_percentage_points).toFixed(1)} percentage points.`}
            </p>
          </div>
        </section>

        <section
          data-spotlight="panel"
          className="workspace-panel min-w-0"
        >
          <WorkspaceSectionHeader
            eyebrow="Matchups"
            title="Head-to-head performance"
            description={<>Every percentage is {deck.name}&apos;s decided-game win rate against the named opponent.</>}
          />

          <div className="mt-4 grid gap-2 2xl:grid-cols-2">
            <MatchupCard label="Highest repeated win rate" matchup={spotlight.matchups.best} tone="good" />
            <MatchupCard label="Lowest repeated win rate" matchup={spotlight.matchups.hardest} tone="danger" />
          </div>
        </section>
      </div>

      <section data-spotlight="panel" className="workspace-panel">
        <WorkspaceSectionHeader eyebrow="Signals" title="What deserves your attention" />

        {spotlight.insights.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            {spotlight.insights.map((insight) => (
              <article
                key={insight.key}
                data-spotlight="insight"
                className={`rounded-2xl border p-4 ${INSIGHT_TONES[insight.tone]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] opacity-70">
                    {insight.eyebrow}
                  </p>
                  <span className="shrink-0 text-sm font-black">{insight.value}</span>
                </div>
                <h5 className="mt-3 text-base font-black leading-6 text-white">{insight.title}</h5>
                <p className="mt-2 text-sm leading-6 text-slate-400">{insight.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <Layers3 className="mx-auto h-6 w-6 text-slate-600" />
            <p className="mt-3 font-bold text-slate-300">The spotlight is ready.</p>
            <p className="mt-1 text-sm text-slate-500">Log a few matches and the signal report will begin finding patterns.</p>
          </div>
        )}
      </section>
      {selectedMatch ? (
        <SpotlightMatchDialog
          match={selectedMatch}
          deckName={deck.name}
          historyUrl={historyUrl}
          onClose={() => setSelectedMatch(null)}
        />
      ) : null}
    </section>
  );
}
