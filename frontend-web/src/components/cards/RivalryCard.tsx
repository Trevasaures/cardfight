import { Swords, Trophy } from "lucide-react";

import { FormatBadge } from "../badges/FormatBadge";
import { ResultBadge } from "../badges/ResultBadge";
import type { Deck, Match, MatchFormat } from "../../types/api";
import { formatDateTime } from "../../utils/format";

export type RivalryRow = {
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

export function RivalryCard({ row }: { row: RivalryRow }) {
  const leader = getRivalryLeader(row);

  const deckAWinPct = row.decided
    ? Math.round((row.deckAWins / row.decided) * 100)
    : 0;

  const deckBWinPct = row.decided
    ? Math.round((row.deckBWins / row.decided) * 100)
    : 0;

  return (
    <article
        data-anime="motion-card"
        className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-xl shadow-black/20 transition will-change-transform hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-slate-900/70"
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <RivalryDeckIdentity deck={row.deckA} name={row.deckAName} />

        <div className="mx-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-5 py-3">
          <span className="text-2xl font-black text-slate-50">
            {row.deckAWins}
          </span>
          <Swords className="h-4 w-4 text-cyan-200" />
          <span className="text-2xl font-black text-slate-50">
            {row.deckBWins}
          </span>
        </div>

        <RivalryDeckIdentity
          deck={row.deckB}
          name={row.deckBName}
          align="right"
        />
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
          <p className="mt-1 text-xl font-bold text-amber-100">
            {row.undecided}
          </p>
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
          {row.decided === 0 ? (
            <div className="w-full bg-slate-700/70" />
          ) : null}
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
            <p className="text-sm font-bold text-slate-300">
              Most recent result
            </p>
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