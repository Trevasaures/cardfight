import { Plus, Trash2 } from "lucide-react";

import type {
  Card,
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
} from "../../types/api";

const ZONES: { value: DeckCardZone; label: string }[] = [
  { value: "main", label: "Main deck" },
  { value: "ride", label: "Ride deck" },
  { value: "g", label: "G zone" },
  { value: "token", label: "Token" },
  { value: "other", label: "Other" },
];

type DeckVersionContentsProps = {
  currentVersion: DeckVersion | null;
  groupedCards: Map<DeckCardZone, DeckCardEntry[]>;
  cardResults: Card[];
  selectedCardId: string;
  addQuantity: number;
  addZone: DeckCardZone;
  saving: boolean;
  selectedCard: Card | null;
  onSelectedCardIdChange: (value: string) => void;
  onAddQuantityChange: (value: number) => void;
  onAddZoneChange: (value: DeckCardZone) => void;
  onAddCardToVersion: () => void;
  onQuantityChange: (entry: DeckCardEntry, nextQuantity: number) => void;
  onRemoveCard: (entry: DeckCardEntry) => void;
};

function zoneLabel(zone: DeckCardZone) {
  return ZONES.find((option) => option.value === zone)?.label ?? zone;
}

function cardMeta(card: Card | null) {
  if (!card) return "Unknown card";

  const chunks = [
    card.grade !== null ? `Grade ${card.grade}` : null,
    card.nation,
    card.card_type,
  ].filter(Boolean);

  return chunks.join(" · ") || "No card metadata";
}

function printingLabel(entry: DeckCardEntry) {
  if (!entry.printing) return "No printing selected";

  return [entry.printing.set_code, entry.printing.rarity]
    .filter(Boolean)
    .join(" · ");
}

export function DeckVersionContents({
  currentVersion,
  groupedCards,
  cardResults,
  selectedCardId,
  addQuantity,
  addZone,
  saving,
  selectedCard,
  onSelectedCardIdChange,
  onAddQuantityChange,
  onAddZoneChange,
  onAddCardToVersion,
  onQuantityChange,
  onRemoveCard,
}: DeckVersionContentsProps) {
  return (
    <section
      data-anime="motion-panel"
      className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Step 3
            </p>
            <h3 className="mt-1 text-2xl font-black text-slate-50">
              {"Deck Build" + (currentVersion?.version_name ? ` - ${currentVersion.version_name}` : "")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Add selected cards into a zone, then manage quantities in the
              compact list below.
            </p>
          </div>
        </div>

        {currentVersion ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
            <p className="text-xs text-slate-500">Current total</p>
            <p className="text-xl font-black text-slate-50">
              {currentVersion.card_count}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_6rem_10rem]">
          <select
            value={selectedCardId}
            onChange={(event) => onSelectedCardIdChange(event.target.value)}
            title="Choose a card from the current search results to add to the selected deck version."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {cardResults.length === 0 ? (
              <option value="">No card selected</option>
            ) : null}
            {cardResults.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={1}
            value={addQuantity}
            onChange={(event) => onAddQuantityChange(Number(event.target.value))}
            title="Quantity of this card to add to the selected zone."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
          />

          <select
            value={addZone}
            onChange={(event) =>
              onAddZoneChange(event.target.value as DeckCardZone)
            }
            title="Choose where this card belongs in the deck list."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
          >
            {ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onAddCardToVersion}
          disabled={!currentVersion || !selectedCard || saving}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          title="Add the selected card to the current deck version"
        >
          <Plus className="h-4 w-4" />
          Add selected card
        </button>
      </div>

      <div className="mt-5 max-h-[34rem] space-y-4 overflow-auto pr-1">
        {currentVersion ? (
          ZONES.map((zone) => {
            const entries = groupedCards.get(zone.value) ?? [];
            const zoneTotal = currentVersion.totals_by_zone[zone.value] ?? 0;

            return (
              <section
                key={zone.value}
                data-builder-anime="zone"
                className="rounded-3xl border border-white/10 bg-black/20 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="font-black text-slate-100">{zone.label}</h4>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-500">
                    {zoneTotal} cards
                  </span>
                </div>

                {entries.length ? (
                  <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                    {entries.map((entry) => (
                      <article
                        key={entry.id}
                        data-builder-anime="deck-entry"
                        className="grid gap-3 p-3 will-change-transform md:grid-cols-[1fr_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-50">
                            {entry.card?.name ?? "Unknown card"}
                          </p>
                          <p className="mt-1 truncate text-sm text-slate-500">
                            {cardMeta(entry.card)}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-600">
                            {printingLabel(entry)}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 md:justify-end">
                          <span className="hidden text-xs text-slate-600 md:inline">
                            {zoneLabel(entry.zone)}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onQuantityChange(entry, entry.quantity - 1)
                              }
                              disabled={entry.quantity <= 1 || saving}
                              className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.04] text-base font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                              title="Decrease quantity"
                            >
                              -
                            </button>

                            <span className="w-8 text-center text-base font-black text-slate-50">
                              {entry.quantity}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                onQuantityChange(entry, entry.quantity + 1)
                              }
                              disabled={saving}
                              className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.04] text-base font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                              title="Increase quantity"
                            >
                              +
                            </button>

                            <button
                              type="button"
                              onClick={() => onRemoveCard(entry)}
                              className="h-8 w-8 rounded-xl border border-rose-300/20 bg-rose-300/10 text-rose-100 transition hover:bg-rose-300/20"
                              title="Remove this card from the deck version"
                            >
                              <Trash2 className="mx-auto h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-sm text-slate-600">
                    No cards in this zone yet.
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className="rounded-[2rem] border border-dashed border-white/15 bg-black/20 p-10 text-center">
            <p className="text-lg font-black text-slate-300">
              No deck version selected.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Create a version for the selected deck, then start adding cards.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}