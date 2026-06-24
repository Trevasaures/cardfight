import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, Swords, Trophy } from "lucide-react";

import { getMatches } from "../api/matches";
import { FormatBadge } from "../components/badges/FormatBadge";
import { ResultBadge } from "../components/badges/ResultBadge";
import { PageHeader } from "../components/layout/PageHeader";
import type { Deck, Match, MatchFormat } from "../types/api";
import { formatDateTime } from "../utils/format";

type FormatFilter = "All" | MatchFormat;
type MinGamesFilter = 1 | 2 | 3 | 5 | 10;

type RivalryRow = {
  key: string;
  deckAId: number;
  deckBId: number;
  deckAName: string;
  deckBName: string;
  deckA: Deck | null;
  deckB: Deck | null;
  deckAWins: number;
  deckBWins: number;
  undecided: number;
  total: number;
  decided: number;
  lastPlayedIso: string | null;
  lastMatch: Match | null;
  formats: Set<string>;
};

const MIN_GAME_OPTIONS: MinGamesFilter[] = [1, 2, 3, 5, 10];

function makePairKey(deck1Id: number, deck2Id: number) {
  return [deck1Id, deck2Id].sort((a, b) => a - b).join("-");
}

function getNationIconPath(deck: Deck | null) {
  if (!deck?.nation_icon) return null;
  return `/nations/${deck.nation_icon}`;
}

function getRivalryLeader(row: RivalryRow) {
  if (row.deckAWins > row.deckBWins) {
    return {
      name: row.deckAName,
      wins: row.deckAWins,
      losses: row.deckBWins,
    };
  }

  if (row.deckBWins > row.deckAWins) {
    return {
      name: row.deckBName,
      wins: row.deckBWins,
      losses: row.deckAWins,
    };
  }

  return null;
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

function RivalryDeckIdentity({
  deck,
  name,
  align = "left",
}: {
  deck: Deck | null;
  name: string;
  align?: "left" | "right";
}) {
  const iconPath = getNationIconPath(deck);

  return (
    <div
      className={[
        "flex min-w-0 items-center gap-3",
        align === "right" ? "flex-row-reverse text-right" : "",
      ].join(" ")}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        {iconPath ? (
          <img
            src={iconPath}
            alt={deck?.nation ?? "Nation icon"}
            className="h-9 w-9 object-contain"
          />
        ) : (
          <span className="text-sm font-black text-slate-600">?</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-base font-black text-slate-50">{name}</p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {deck?.nation ?? "No nation"}
        </p>
      </div>
    </div>
  );
}

function RivalryCard({ row }: { row: RivalryRow }) {
  const leader = getRivalryLeader(row);
  const deckAWinPct = row.decided ? Math.round((row.deckAWins / row.decided) * 100) : 0;
  const deckBWinPct = row.decided ? Math.round((row.deckBWins / row.decided) * 100) : 0;

  return (
    <article className="rounded-[2rem] border border-white/10 bg-slate-950/45 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-slate-900/70">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <RivalryDeckIdentity deck={row.deckA} name={row.deckAName} />

        <div className="mx-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-5 py-3">
          <span className="text-2xl font-black text-slate-50">{row.deckAWins}</span>
          <Swords className="h-4 w-4 text-cyan-200" />
          <span className="text-2xl font-black text-slate-50">{row.deckBWins}</span>
        </div>

        <RivalryDeckIdentity deck={row.deckB} name={row.deckBName} align="right" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Total</p>
          <p className="mt-1 text-xl font-bold text-slate-100">{row.total}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Decided</p>
          <p className="mt-1 text-xl font-bold text-slate-100">{row.decided}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Undecided</p>
          <p className="mt-1 text-xl font-bold text-amber-100">{row.undecided}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-slate-500">Last played</p>
          <p className="mt-1 truncate text-sm font-bold text-slate-100">
            {formatDateTime(row.lastPlayedIso)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div className="flex h-3">
          <div
            className="bg-cyan-300/70"
            style={{ width: `${deckAWinPct}%` }}
            title={`${row.deckAName}: ${deckAWinPct}%`}
          />
          <div
            className="bg-violet-300/70"
            style={{ width: `${deckBWinPct}%` }}
            title={`${row.deckBName}: ${deckBWinPct}%`}
          />
          {row.decided === 0 ? <div className="w-full bg-slate-700/70" /> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {Array.from(row.formats).map((format) => (
            <FormatBadge key={format} type={format as MatchFormat} />
          ))}
        </div>

        {leader ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-100">
            <Trophy className="h-3.5 w-3.5" />
            {leader.name} leads {leader.wins}-{leader.losses}
          </div>
        ) : (
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400">
            Series tied
          </div>
        )}
      </div>

      {row.lastMatch ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-300">Most recent result</p>
            <ResultBadge match={row.lastMatch} />
          </div>

          <p className="mt-2 text-sm text-slate-500">
            {row.lastMatch.is_undecided
              ? "No winner recorded."
              : `${row.lastMatch.winner_name ?? "Unknown"} won.`}
            {row.lastMatch.first_player_name
              ? ` First player: ${row.lastMatch.first_player_name}.`
              : ""}
          </p>

          {row.lastMatch.notes ? (
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {row.lastMatch.notes}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
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

      <section className="grid gap-4 md:grid-cols-3">
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

      <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
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
            onChange={(event) => setMinGames(Number(event.target.value) as MinGamesFilter)}
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