import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";

import { getMatches } from "../api/matches";
import {
  RivalryCard,
  type RivalryRow,
} from "../components/cards/RivalryCard";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { WorkspaceSectionHeader } from "../components/layout/WorkspaceSectionHeader";
import type { Match, MatchFormat } from "../types/api";

type FormatFilter = "All" | MatchFormat;
type MinGamesFilter = 1 | 2 | 3 | 5 | 10;

const MIN_GAME_OPTIONS: MinGamesFilter[] = [1, 2, 3, 5, 10];

function makePairKey(deck1Id: number, deck2Id: number) {
  return [deck1Id, deck2Id].sort((a, b) => a - b).join("-");
}

function buildRivalries(matches: Match[]) {
  const map = new Map<string, RivalryRow>();

  for (const match of matches) {
    const key = makePairKey(match.deck1_id, match.deck2_id);
    const existing = map.get(key);

    const deckAIsDeck1 = match.deck1_id < match.deck2_id;

    const deckAId = deckAIsDeck1 ? match.deck1_id : match.deck2_id;
    const deckBId = deckAIsDeck1 ? match.deck2_id : match.deck1_id;

    const deckAName = deckAIsDeck1 ? match.deck1_name : match.deck2_name;
    const deckBName = deckAIsDeck1 ? match.deck2_name : match.deck1_name;

    const deckA = deckAIsDeck1 ? match.deck1 : match.deck2;
    const deckB = deckAIsDeck1 ? match.deck2 : match.deck1;

    const row =
      existing ??
      ({
        key,
        deckAId,
        deckBId,
        deckAName,
        deckBName,
        deckA,
        deckB,
        deckAWins: 0,
        deckBWins: 0,
        undecided: 0,
        total: 0,
        decided: 0,
        lastPlayedIso: null,
        lastMatch: null,
        formats: new Set<string>(),
      } satisfies RivalryRow);

    row.total += 1;

    if (match.format) {
      row.formats.add(match.format);
    }

    if (match.is_undecided || match.winner_id === null) {
      row.undecided += 1;
    } else {
      row.decided += 1;

      if (match.winner_id === row.deckAId) {
        row.deckAWins += 1;
      } else if (match.winner_id === row.deckBId) {
        row.deckBWins += 1;
      }
    }

    const matchDate = match.date_played_iso;

    if (
      matchDate &&
      (!row.lastPlayedIso || new Date(matchDate) > new Date(row.lastPlayedIso))
    ) {
      row.lastPlayedIso = matchDate;
      row.lastMatch = match;
    }

    map.set(key, row);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return (b.lastPlayedIso ?? "").localeCompare(a.lastPlayedIso ?? "");
  });
}

export function Rivalries() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<FormatFilter>("All");
  const [minGames, setMinGames] = useState<MinGamesFilter>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

  async function loadMatches() {
    setError(null);
    setLoading(true);

    try {
      const rows = await getMatches();
      setMatches(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rivalries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMatches();
  }, []);

  const rivalryRows = useMemo(() => buildRivalries(matches), [matches]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rivalryRows.filter((row) => {
      const matchesSearch =
        !needle ||
        row.deckAName.toLowerCase().includes(needle) ||
        row.deckBName.toLowerCase().includes(needle) ||
        (row.deckA?.nation ?? "").toLowerCase().includes(needle) ||
        (row.deckB?.nation ?? "").toLowerCase().includes(needle);

      const matchesFormat = format === "All" || row.formats.has(format);
      const matchesMinGames = row.total >= minGames;

      return matchesSearch && matchesFormat && matchesMinGames;
    });
  }, [rivalryRows, search, format, minGames]);

  const topRivalry = rivalryRows[0] ?? null;
  const totalPairings = rivalryRows.length;
  const totalLogged = matches.length;

  return (
    <>
      <PageHeader
        eyebrow="Rivalries"
        title="Deck vs deck history"
        description="Compare head-to-head records, follow each series, and revisit the latest result."
      />

      <section
        data-anime="motion-panel"
        className="workspace-panel"
      >
        <WorkspaceSectionHeader
          eyebrow="Series"
          title="Rivalry board"
          description="Find a pairing by deck, nation, format, or games played."
          actions={
            <button
              type="button"
              onClick={loadMatches}
              disabled={loading}
              className="workspace-button inline-flex items-center justify-center gap-2 border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.09] disabled:opacity-40"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          }
        />

        <div className="workspace-inset mt-4 grid grid-cols-2 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
          <div className="border-r border-white/10 px-4 py-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-slate-500">Pairings</p>
            <p className="mt-1 text-2xl font-black text-white">{totalPairings}</p>
          </div>
          <div className="px-4 py-3 md:border-r md:border-white/10">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-slate-500">Logged matches</p>
            <p className="mt-1 text-2xl font-black text-white">{totalLogged}</p>
          </div>
          <div className="col-span-2 min-w-0 border-t border-white/10 px-4 py-3 md:col-span-1 md:border-t-0">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-slate-500">Most played pairing</p>
            <p className="mt-1 break-words text-base font-black text-cyan-100">
              {topRivalry ? `${topRivalry.deckAName} vs ${topRivalry.deckBName}` : "No rivalry yet"}
            </p>
            {topRivalry ? <p className="mt-0.5 text-xs text-slate-500">{topRivalry.total} matches</p> : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-label="Search rivalries by deck or nation"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decks or nations..."
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>

          <select
            aria-label="Rivalry format"
            value={format}
            onChange={(event) => setFormat(event.target.value as FormatFilter)}
            className="workspace-control min-w-0 border border-white/10 bg-black/30 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
          >
            <option value="All">All formats</option>
            <option value="Any">Any</option>
            <option value="Standard">Standard</option>
            <option value="Stride">Stride</option>
          </select>

          <select
            aria-label="Minimum rivalry games"
            value={minGames}
            onChange={(event) =>
              setMinGames(Number(event.target.value) as MinGamesFilter)
            }
            className="workspace-control min-w-0 border border-white/10 bg-black/30 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {MIN_GAME_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}+ games
              </option>
            ))}
          </select>

        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{filteredRows.length} of {rivalryRows.length} pairings shown</span>
          {search || format !== "All" || minGames !== 1 ? (
            <button type="button" onClick={() => { setSearch(""); setFormat("All"); setMinGames(1); }} className="font-semibold text-cyan-200 transition hover:text-cyan-100">Clear filters</button>
          ) : <span>Most played first</span>}
        </div>
      </section>

      {loading ? (
        <div className="workspace-panel mt-4 text-sm text-slate-400">
          Loading rivalries...
        </div>
      ) : filteredRows.length ? (
        <section className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          {filteredRows.map((row) => (
            <RivalryCard key={row.key} row={row} />
          ))}
        </section>
      ) : (
        <section className="workspace-panel mt-4 border-dashed py-8 text-center">
          <p className="text-lg font-bold text-slate-300">No rivalries found.</p>
          <p className="mt-2 text-sm text-slate-500">
            {rivalryRows.length ? "Try a different deck, format, or minimum game count." : "Log a few matches in Play Lab to start a head-to-head record."}
          </p>
        </section>
      )}
    </>
  );
}
