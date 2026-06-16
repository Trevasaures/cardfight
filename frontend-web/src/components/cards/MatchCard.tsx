import { FormatBadge } from "../badges/FormatBadge";
import type { Match } from "../../types/api";
import { formatDateTime } from "../../utils/format";

type MatchCardProps = {
  match: Match;
};

export function MatchCard({ match }: MatchCardProps) {
  const resultLabel = match.is_undecided
    ? "Undecided"
    : `${match.winner_name ?? "Unknown"} won`;

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
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

        <FormatBadge type={match.format} />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <p className="text-sm font-semibold text-slate-200">{resultLabel}</p>
        {match.first_player_name ? (
          <p className="mt-1 text-xs text-slate-500">
            First player: {match.first_player_name}
          </p>
        ) : null}
      </div>

      {match.notes ? (
        <p className="mt-4 text-sm leading-6 text-slate-400">{match.notes}</p>
      ) : null}
    </article>
  );
}