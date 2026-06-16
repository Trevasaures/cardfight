import { FormatBadge } from "../badges/FormatBadge";
import { StatusBadge } from "../badges/StatusBadge";
import type { Deck } from "../../types/api";
import { formatPercent, formatRecord } from "../../utils/format";

type DeckCardProps = {
  deck: Deck;
};

export function DeckCard({ deck }: DeckCardProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-50">{deck.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatRecord(deck.wins, deck.losses)} · {formatPercent(deck.win_pct)}
          </p>
        </div>

        <StatusBadge active={deck.active} />
      </div>

      <div className="mt-5 flex items-center justify-between">
        <FormatBadge type={deck.type} />
        <span className="text-sm text-slate-500">
          {deck.decided_games} decided
        </span>
      </div>
    </article>
  );
}