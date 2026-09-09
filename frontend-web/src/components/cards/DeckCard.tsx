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
      className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/45 p-4 transition will-change-transform hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
            {iconPath ? (
              <img
                src={iconPath}
                alt={deck.nation ?? "Nation icon"}
                className="h-9 w-9 object-contain"
              />
            ) : (
              <span className="text-xl font-black text-slate-600">?</span>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="break-words text-base font-black text-slate-50">
              {deck.name}
            </h3>

            <p className="mt-0.5 text-xs text-slate-500">
              {deck.nation ?? "No nation selected"}
            </p>
          </div>
        </div>

        <StatusBadge active={deck.active} />
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-black/20">
        <div className="min-w-0 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-500">Record</p>
          <p className="mt-0.5 text-sm font-black text-slate-200">{formatRecord(deck.wins, deck.losses)}</p>
        </div>
        <div className="min-w-0 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-500">Win rate</p>
          <p className="mt-0.5 text-sm font-black text-cyan-100">{formatPercent(deck.win_pct)}</p>
        </div>
        <div className="min-w-0 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-500">Decided</p>
          <p className="mt-0.5 text-sm font-black text-slate-200">{deck.decided_games}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <FormatBadge type={deck.type} />
      {onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(deck)}
          className="workspace-button inline-flex items-center justify-center gap-2 border border-white/10 bg-white/[0.05] px-3 text-xs font-bold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
        >
          <Pencil className="h-4 w-4" />
          Edit deck
        </button>
      ) : null}
      </div>
    </article>
  );
}
