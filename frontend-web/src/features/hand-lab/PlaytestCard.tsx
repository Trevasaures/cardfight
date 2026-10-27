import type { PointerEvent } from "react";
import { Check } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import type { TableCard } from "./playtest";
import { isCrestEntry } from "./crests";
import { isSelectionClick } from "./selection";
import { PersonaTicketArtwork } from "./PersonaTicketArtwork";

type Props = {
  card: TableCard;
  entry: DeckCardEntry | undefined;
  index: number;
  effectiveGrade?: number | null;
  compact: boolean;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
  disabled: boolean;
  onSelect: (card: TableCard) => void;
  onRest?: (card: TableCard) => void;
  onDragStart: (event: PointerEvent<HTMLElement>, card: TableCard) => void;
};

/** Shared card display for the hand and compact zone-inspector list. */
export function PlaytestCard({
  card,
  entry,
  index,
  effectiveGrade,
  compact,
  selected,
  draggable,
  dragging,
  disabled,
  onSelect,
  onRest,
  onDragStart,
}: Props) {
  if (!entry?.card) return null;
  const crest = Boolean(card.crest || isCrestEntry(entry));
  const ticket = card.ticket === "personaShield";
  return (
    <button
      type="button"
      key={card.key}
      className={`pt-card ${crest ? "is-crest" : ""} ${ticket ? "is-persona-ticket" : ""} ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""} ${draggable && !ticket ? "pt-draggable" : ""} ${dragging ? "is-drag-source" : ""}`}
      onPointerDown={(event) => {
        if (draggable && !ticket) onDragStart(event, card);
      }}
      aria-label={`${selected ? "Deselect" : "Select"} ${entry.card.name}, card ${index + 1}`}
      aria-pressed={selected}
      disabled={disabled}
      title={
        onRest ? `Double-click to ${card.rested ? "stand" : "rest"}` : undefined
      }
      onClick={(event) => {
        if (isSelectionClick(event.detail, Boolean(onRest))) onSelect(card);
      }}
      onDoubleClick={() => onRest?.(card)}
    >
      <span className="pt-card-art">
        {ticket ? (
          <PersonaTicketArtwork />
        ) : (
          <CardArtwork card={entry.card} printing={entry.printing} />
        )}
        {!crest && !ticket && (
          <span className="hand-grade">
            G{effectiveGrade ?? entry.card.grade ?? "?"}
          </span>
        )}
        {selected && (
          <span className="pt-card-check">
            <Check size={15} />
          </span>
        )}
      </span>
      <span className="pt-card-info">
        <span>{entry.card.name}</span>
        <small>
          {ticket
            ? "Ticket"
            : card.faceDown
            ? "Face down"
            : card.rested
              ? "Rest"
              : entry.card.trigger_type || entry.card.card_type}
        </small>
      </span>
    </button>
  );
}
