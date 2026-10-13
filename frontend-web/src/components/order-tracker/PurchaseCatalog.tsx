import { Plus, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { CardArtwork } from "../cards/CardArtwork";
import { cardGradeBadge } from "../../utils/cards";
import type { Card, CardPrinting } from "../../types/api";

type Props = {
  query: string;
  results: Card[];
  searched: boolean;
  searching: boolean;
  busyLine: string | null;
  disabled: boolean;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onAdd: (card: Card, printing: CardPrinting | null) => void;
  onInspect: (card: Card, printing: CardPrinting | null) => void;
};

export function PurchaseCatalog({
  query,
  results,
  searched,
  searching,
  busyLine,
  disabled,
  onQueryChange,
  onSearch,
  onClear,
  onAdd,
  onInspect,
}: Props) {
  return (
    <div
      className="border-b border-white/10 bg-black/10 p-4"
      aria-label="Add purchase cards"
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search card catalog</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Card name, set, nation…"
            className="workspace-control w-full"
          />
        </label>
        <button
          type="submit"
          disabled={searching || disabled}
          className="collection-button"
          aria-label="Search purchase catalog"
        >
          <Search />
        </button>
        <button
          type="button"
          onClick={onClear}
          className="collection-button subtle"
          aria-label="Clear catalog search"
        >
          <X />
        </button>
      </form>
      {results.length > 0 && (
        <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {results.flatMap((card) =>
            (card.printings.length ? card.printings : [null]).map(
              (printing) => {
                const key = `${card.id}-${printing?.id ?? "any"}`;
                return (
                  <div
                    key={key}
                    className="builder-catalog-card border-white/10 bg-white/[0.025]"
                  >
                    <div className="collection-artwork">
                      <CardArtwork card={card} printing={printing} />
                      <span className="collection-grade">
                        {cardGradeBadge(card)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="orders-catalog-inspect min-w-0 flex-1 text-left"
                      onClick={() => onInspect(card, printing)}
                    >
                      <span className="builder-card-name">{card.name}</span>
                      <span className="builder-card-meta">
                        {printing
                          ? [printing.set_code, printing.rarity]
                              .filter(Boolean)
                              .join(" · ")
                          : "Any printing"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busyLine !== null || disabled}
                      onClick={() => onAdd(card, printing)}
                      className="collection-button subtle"
                      aria-label={`Add ${card.name} to purchase plan`}
                    >
                      <Plus size={14} className="shrink-0 text-cyan-200" />
                    </button>
                  </div>
                );
              },
            ),
          )}
        </div>
      )}
      {searched && !searching && !results.length && (
        <p role="status" className="collection-muted mt-3 mb-0">
          No cards found.{" "}
          <Link to="/cards" className="text-cyan-200 underline">
            Card Library
          </Link>
        </p>
      )}
    </div>
  );
}
