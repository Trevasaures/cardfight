import { Trash2 } from "lucide-react";

import { FormatBadge } from "../badges/FormatBadge";
import { ResultBadge } from "../badges/ResultBadge";
import type { Match } from "../../types/api";
import { formatDateTime } from "../../utils/format";

type MatchCardProps = {
  match: Match;
  onDelete?: (matchId: number) => void;
};

export function MatchCard({ match, onDelete }: MatchCardProps) {
  const resultLabel = match.is_undecided
    ? "No winner recorded"
    : `${match.winner_name ?? "Unknown"} won`;

  return (
    <article
      data-anime="motion-card"
      className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-cyan-300/25 hover:bg-white/[0.035]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-44">
          <h3 className="break-words text-sm font-black text-slate-50">
            {match.deck1_name} <span className="text-slate-500">vs</span>{" "}
            {match.deck2_name}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(match.date_played_iso)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FormatBadge type={match.format} />
          <ResultBadge match={match} />

          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(match.id)}
              className="rounded-lg border border-transparent p-2 text-slate-500 transition hover:border-rose-300/20 hover:bg-rose-300/10 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-cyan-300/60"
              title="Delete match"
              aria-label={`Delete ${match.deck1_name} versus ${match.deck2_name} match`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
        <p className={`text-xs font-bold ${match.is_undecided ? "text-amber-100/85" : "text-emerald-100/85"}`}>{resultLabel}</p>

        {match.first_player_name ? (
          <p className="text-[0.65rem] text-slate-400">
            First player: {match.first_player_name}
          </p>
        ) : (
          <p className="text-[0.65rem] text-slate-500">
            First player not recorded
          </p>
        )}
      </div>

      {match.notes ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{match.notes}</p>
      ) : null}
    </article>
  );
}
