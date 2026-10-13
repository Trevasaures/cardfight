import type { PointerEvent } from "react";
import { Check, ChevronRight, Layers3 } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { TableCard } from "./playtest";
import type { RuleContext } from "./rules/types";
import { generationBreak, isGUnit } from "./stride";
import "./g-zone.css";

type Props = {
  context: RuleContext;
  disabled: boolean;
  selected: readonly string[];
  draggedKeys: readonly string[];
  dropClassName: string;
  onOpen: () => void;
  onSelect: (card: TableCard) => void;
  onDragStart: (event: PointerEvent<HTMLElement>, card: TableCard) => void;
};

/** One G-zone tray: cost flips and returning strides stay visible as physical copies. */
export function GZoneTracker({
  context,
  disabled,
  selected,
  draggedKeys,
  dropClassName,
  onOpen,
  onSelect,
  onDragStart,
}: Props) {
  const { session, entries } = context;
  const counts = generationBreak(context);
  const faceUp = session.zones.g.filter((card) => !card.faceDown);
  const faceDownUnits = session.zones.g.filter(
    (card) => card.faceDown && isGUnit(card, entries.get(card.entryId)),
  ).length;

  return (
    <section
      className={`pt-g-tracker ${dropClassName}`}
      data-drop-zone="g"
      aria-label="G zone"
    >
      <div className="pt-g-heading">
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          aria-label={`Inspect G zone, ${session.zones.g.length} cards`}
        >
          <Layers3 size={13} /> G zone <strong>{session.zones.g.length}</strong>
          <ChevronRight size={13} />
        </button>
        <span
          className="pt-generation-break"
          title="Face-up G units in the G zone and on Vanguard"
          aria-label={`Generation Break ${counts.total}`}
        >
          GB <strong>{counts.total}</strong>
        </span>
      </div>
      <div className="pt-g-counts">
        <span>
          Face-up G <strong>{counts.gFaceUp}</strong>
        </span>
        <span>
          Stride <strong>{counts.vanguardG}</strong>
        </span>
        <span>
          Face down <strong>{faceDownUnits}</strong>
        </span>
      </div>
      <div className="pt-g-face-up-label">Face up</div>
      <div
        className="pt-g-face-up"
        data-drag-scroll
        role="group"
        aria-label="Face-up G-zone cards"
        title="Drop a G unit here to turn it face up, or return the active stride"
      >
        {faceUp.map((card) => {
          const entry = entries.get(card.entryId);
          if (!entry?.card) return null;
          const name = entry.card.name;
          const isSelected = selected.includes(card.key);
          return (
            <button
              key={card.key}
              type="button"
              className={`pt-g-copy ${isSelected ? "is-selected" : ""} ${draggedKeys.includes(card.key) ? "is-drag-source" : ""} ${disabled ? "" : "pt-draggable"}`}
              disabled={disabled}
              aria-label={`${isSelected ? "Deselect" : "Select"} face-up ${name} in G zone`}
              aria-pressed={isSelected}
              title={name}
              onClick={() => onSelect(card)}
              onPointerDown={(event) => {
                if (!disabled) onDragStart(event, card);
              }}
            >
              <span className="pt-g-copy-art">
                <CardArtwork card={entry.card} printing={entry.printing} />
                {isSelected && (
                  <span className="pt-card-check">
                    <Check size={12} />
                  </span>
                )}
              </span>
              <span className="pt-g-copy-name">{name}</span>
            </button>
          );
        })}
        {!faceUp.length && (
          <button
            type="button"
            className="pt-g-empty"
            disabled={disabled}
            onClick={onOpen}
          >
            <Layers3 size={22} strokeWidth={1} />
            Drop to turn face up
          </button>
        )}
      </div>
    </section>
  );
}
