import type { PointerEvent } from "react";
import { Check, Layers3, Plus } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import { ZONES, type TableCard } from "./playtest";

type Resource = "damage" | "soul";

type Props = {
  zone: Resource;
  cards: TableCard[];
  entries: Map<number, DeckCardEntry>;
  selected: string[];
  draggedKeys: string[];
  playing: boolean;
  canCharge: boolean;
  dropClassName: string;
  onOpen: (zone: Resource) => void;
  onSelect: (card: TableCard) => void;
  onUse: (card: TableCard) => void;
  onCharge: () => void;
  onDragStart: (event: PointerEvent<HTMLElement>, card: TableCard) => void;
};

/** Keep resource copies in zone order; flipping never moves a card to a new slot. */
export function ResourceZone({
  zone,
  cards,
  entries,
  selected,
  draggedKeys,
  playing,
  canCharge,
  dropClassName,
  onOpen,
  onSelect,
  onUse,
  onCharge,
  onDragStart,
}: Props) {
  const damage = zone === "damage";
  const faceUp = cards.filter((card) => !card.faceDown).length;

  return (
    <section
      className={`pt-zone pt-resource pt-resource-${zone} ${dropClassName}`}
      data-drop-zone={zone}
      aria-label={`${ZONES[zone]} zone`}
    >
      <div className="pt-resource-header">
        <button
          type="button"
          className="pt-resource-heading"
          onClick={() => onOpen(zone)}
          aria-label={`View ${ZONES[zone]} (${cards.length})`}
        >
          {ZONES[zone]} <strong>{cards.length}</strong>
        </button>
        {damage ? (
          <span className="pt-resource-available">{faceUp} face up</span>
        ) : (
          <button
            type="button"
            className="hand-button pt-resource-charge"
            disabled={!canCharge}
            onClick={onCharge}
            aria-label="Soul charge one card"
          >
            <Plus size={12} /> Charge
          </button>
        )}
      </div>
      <ol className="pt-resource-cards" data-drag-scroll>
        {cards.map((card, index) => {
          const entry = entries.get(card.entryId);
          const name = entry?.card?.name ?? "Card";
          const grade = entry?.card?.grade ?? "?";
          const isSelected = selected.includes(card.key);
          const state = card.faceDown ? "face down" : "face up";
          const action = damage
            ? card.faceDown
              ? "Counter charge"
              : "Counter blast"
            : "Soul blast";

          return (
            <li key={card.key} className="pt-resource-slot">
              <button
                type="button"
                className={`pt-resource-card ${card.faceDown ? "is-face-down" : ""} ${isSelected ? "is-selected" : ""} ${playing ? "pt-draggable" : ""} ${draggedKeys.includes(card.key) ? "is-drag-source" : ""}`}
                aria-label={`Select ${ZONES[zone]} card ${index + 1}: ${name}${damage ? "" : `, grade ${grade}`}, ${state}`}
                aria-pressed={isSelected}
                title={`${name}${damage ? "" : ` · G${grade}`} · ${state}`}
                disabled={!playing}
                onClick={() => onSelect(card)}
                onPointerDown={(event) => {
                  if (playing) onDragStart(event, card);
                }}
              >
                <span
                  className={`pt-miniature ${card.faceDown ? "is-hidden" : ""}`}
                >
                  {card.faceDown || !entry?.card ? (
                    <Layers3 size={22} strokeWidth={1} />
                  ) : (
                    <CardArtwork card={entry.card} printing={entry.printing} />
                  )}
                </span>
                <span className="pt-resource-position" aria-hidden="true">
                  {damage ? index + 1 : `G${grade}`}
                </span>
                {isSelected && (
                  <span className="pt-card-check">
                    <Check size={12} />
                  </span>
                )}
              </button>
              <span className="pt-resource-name" title={name}>
                {name}
              </span>
              <button
                type="button"
                className={`pt-resource-use ${damage && card.faceDown ? "is-spent" : ""}`}
                disabled={!playing}
                onClick={() => onUse(card)}
                title={`${action} · ${name}`}
                aria-label={`${action} ${ZONES[zone].toLowerCase()} card ${index + 1}${damage ? "" : `: ${name}, grade ${grade}`}`}
              >
                {damage ? (card.faceDown ? "CC" : "CB") : "Blast"}
              </button>
            </li>
          );
        })}
        {/* Six visible positions make damage easy to count, without capping a sandbox. */}
        {damage &&
          Array.from({ length: Math.max(0, 6 - cards.length) }, (_, index) => (
            <li
              className="pt-resource-empty"
              key={`empty-${index}`}
              aria-hidden="true"
            >
              {cards.length + index + 1}
            </li>
          ))}
      </ol>
      {!damage && !cards.length && (
        <span className="pt-resource-empty-soul">Empty</span>
      )}
    </section>
  );
}
