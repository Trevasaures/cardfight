import type { Match } from "../../types/api";

type ResultBadgeProps = {
  match: Match;
};

export function ResultBadge({ match }: ResultBadgeProps) {
  const label = match.is_undecided ? "Undecided" : "Decided";

  const className = match.is_undecided
    ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
    : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}