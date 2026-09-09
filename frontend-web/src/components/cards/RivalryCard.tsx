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
        "flex min-w-0 gap-1.5 sm:items-center sm:gap-2.5",
        align === "right" ? "flex-col items-end text-right sm:flex-row-reverse" : "flex-col items-start sm:flex-row",
      ].join(" ")}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
        {iconPath ? (
          <img
            src={iconPath}
            alt={deck?.nation ?? "Nation icon"}
            className="h-7 w-7 object-contain"
          />
        ) : (
          <span className="text-sm font-black text-slate-600">?</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="break-words text-sm font-black text-slate-50">{name}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
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
        className="workspace-panel min-w-0 shadow-xl shadow-black/10 transition will-change-transform hover:-translate-y-0.5 hover:border-cyan-300/30"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <RivalryDeckIdentity deck={row.deckA} name={row.deckAName} />

        <div className="mx-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 sm:px-3">
          <span className="text-xl font-black text-slate-50">
            {row.deckAWins}
          </span>
          <Swords className="h-3.5 w-3.5 text-cyan-200" />
          <span className="text-xl font-black text-slate-50">
            {row.deckBWins}
          </span>
        </div>

        <RivalryDeckIdentity
          deck={row.deckB}
          name={row.deckBName}
          align="right"
        />
      </div>

      <div className="workspace-inset mt-4 grid grid-cols-3 overflow-hidden">
        <div className="border-r border-white/10 px-3 py-2.5">
          <p className="text-[0.65rem] text-slate-500">Total</p>
          <p className="mt-0.5 text-base font-bold text-slate-100">{row.total}</p>
        </div>

        <div className="border-r border-white/10 px-3 py-2.5">
          <p className="text-[0.65rem] text-slate-500">Decided</p>
          <p className="mt-0.5 text-base font-bold text-slate-100">{row.decided}</p>
        </div>

        <div className="px-3 py-2.5">
          <p className="text-[0.65rem] text-slate-500">Undecided</p>
          <p className="mt-0.5 text-base font-bold text-amber-100">
            {row.undecided}
          </p>
        </div>

      </div>

      <div className="mt-3 overflow-hidden rounded-full bg-black/20" role="img" aria-label={`Decided-game wins: ${row.deckAName} ${deckAWinPct} percent; ${row.deckBName} ${deckBWinPct} percent`}>
        <div className="flex h-1.5">
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
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[0.65rem] font-semibold">
        <span className="text-cyan-200">{deckAWinPct}%</span>
        <span className="font-normal text-slate-500">Decided-game win share</span>
        <span className="text-violet-200">{deckBWinPct}%</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {Array.from(row.formats).map((format) => (
            <FormatBadge key={format} type={format as MatchFormat} />
          ))}
        </div>

        {leader ? (
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-bold text-amber-100">
            <Trophy className="h-3.5 w-3.5 shrink-0" />
            {leader.name} leads {leader.wins}-{leader.losses}
          </div>
        ) : (
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-slate-400">
            Series tied
          </div>
        )}
      </div>

      {row.lastMatch ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-300">Latest result</p>
              <p className="mt-0.5 text-[0.65rem] text-slate-500">{formatDateTime(row.lastPlayedIso)}</p>
            </div>
            <ResultBadge match={row.lastMatch} />
          </div>

          <p className="mt-2 text-xs leading-5 text-slate-400">
            {row.lastMatch.is_undecided
              ? "No winner recorded."
              : `${row.lastMatch.winner_name ?? "Unknown"} won.`}
            {row.lastMatch.first_player_name
              ? ` First player: ${row.lastMatch.first_player_name}.`
              : ""}
          </p>

          {row.lastMatch.notes ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-cyan-200 transition hover:text-cyan-100">Match notes</summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{row.lastMatch.notes}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
