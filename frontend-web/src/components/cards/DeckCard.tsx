import { Pencil } from "lucide-react";

import { FormatBadge } from "../badges/FormatBadge";
import { StatusBadge } from "../badges/StatusBadge";
import type { Deck } from "../../types/api";
import { formatPercent, formatRecord } from "../../utils/format";

type DeckCardProps = {
  deck: Deck;
  onEdit?: (deck: Deck) => void;
};

function getNationIconPath(deck: Deck) {
  if (!deck.nation_icon) return null;
  return `/nations/${deck.nation_icon}`;
}

export function DeckCard({ deck, onEdit }: DeckCardProps) {
  const iconPath = getNationIconPath(deck);

  return (
    <article
      data-anime="motion-card"
      className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-xl shadow-black/20 transition will-change-transform hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            {iconPath ? (
              <img
                src={iconPath}
                alt={deck.nation ?? "Nation icon"}
                className="h-12 w-12 object-contain"
              />
            ) : (
              <span className="text-xl font-black text-slate-600">?</span>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-50">
              {deck.name}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {deck.nation ?? "No nation selected"}
            </p>

            <p className="mt-2 text-sm text-slate-400">
              {formatRecord(deck.wins, deck.losses)} · {formatPercent(deck.win_pct)}
            </p>
          </div>
        </div>

        <StatusBadge active={deck.active} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <FormatBadge type={deck.type} />
        <span className="text-sm text-slate-500">
          {deck.decided_games} decided
        </span>
      </div>

      {onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(deck)}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
        >
          <Pencil className="h-4 w-4" />
          Edit deck
        </button>
      ) : null}
    </article>
  );
}