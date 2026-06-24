import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";

import { getMatches } from "../api/matches";
import {
  RivalryCard,
  type RivalryRow,
} from "../components/cards/RivalryCard";
import { PageHeader } from "../components/layout/PageHeader";
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
        description="Turn match history into head-to-head rivalry cards with records, leaders, undecided games, and recent results."
      />

      <section data-anime="motion-panel" className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-500">Pairings</p>
          <p className="mt-2 text-3xl font-black">{totalPairings}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-500">Logged matches</p>
          <p className="mt-2 text-3xl font-black">{totalLogged}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-500">Top rivalry</p>
          <p className="mt-2 truncate text-xl font-black text-cyan-100">
            {topRivalry
              ? `${topRivalry.deckAName} vs ${topRivalry.deckBName}`
              : "No rivalry yet"}
          </p>
        </div>
      </section>

      <section
        data-anime="motion-panel"
        className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decks or nations..."
              className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>

          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as FormatFilter)}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            <option value="All">All formats</option>
            <option value="Any">Any</option>
            <option value="Standard">Standard</option>
            <option value="Stride">Stride</option>
          </select>

          <select
            value={minGames}
            onChange={(event) =>
              setMinGames(Number(event.target.value) as MinGamesFilter)
            }
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {MIN_GAME_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}+ games
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadMatches}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09]"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
          <span>{filteredRows.length} rivalries shown</span>
          <span>•</span>
          <span>{rivalryRows.length} total pairings</span>
        </div>
      </section>

      {error ? (
        <div className="mt-6 rounded-3xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading rivalries...
        </div>
      ) : filteredRows.length ? (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          {filteredRows.map((row) => (
            <RivalryCard key={row.key} row={row} />
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
          <p className="text-lg font-bold text-slate-300">No rivalries found.</p>
          <p className="mt-2 text-sm text-slate-500">
            Log a few matches in Play Lab and this board will start getting spicy.
          </p>
        </section>
      )}
    </>
  );
}