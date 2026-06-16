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
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 transition hover:border-cyan-300/20 hover:bg-white/[0.06]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-50">
            {match.deck1_name} <span className="text-slate-500">vs</span>{" "}
            {match.deck2_name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatDateTime(match.date_played_iso)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <FormatBadge type={match.format} />
          <ResultBadge match={match} />

          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(match.id)}
              className="rounded-full border border-rose-300/20 bg-rose-300/10 p-2 text-rose-100 transition hover:bg-rose-300/20"
              title="Delete match"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <p className="text-sm font-semibold text-slate-200">{resultLabel}</p>

        {match.first_player_name ? (
          <p className="mt-1 text-xs text-slate-500">
            First player: {match.first_player_name}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-600">First player not recorded</p>
        )}
      </div>

      {match.notes ? (
        <p className="mt-4 text-sm leading-6 text-slate-400">{match.notes}</p>
      ) : null}
    </article>
  );
}