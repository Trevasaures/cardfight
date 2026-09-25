import type { PointerEvent } from "react";
import { Layers3, Plus } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import { CIRCLES, ZONES, type TableCard, type Zone } from "./playtest";

type Props = {
  zone: Zone;
  cards: TableCard[];
  entries: Map<number, DeckCardEntry>;
  selected: string[];
  draggedKeys: string[];
  draggable: boolean;
  dropClassName: string;
  onOpen: (zone: Zone) => void;
  onDragStart: (
    event: PointerEvent<HTMLElement>,
    card: TableCard,
    hidden: boolean,
  ) => void;
};

function formatPower(
  card: TableCard,
  basePower: number | null | undefined,
): string {
  if (basePower != null) return (basePower + card.power).toLocaleString();
  if (!card.power) return "—";

  // Missing library stats still allow displaying the player's manual power bonus.
  return `${card.power > 0 ? "+" : ""}${card.power.toLocaleString()}`;
}

/** A circle or pile keeps the same drop target whether it is empty or occupied. */
export function PlaytestZone({
  zone,
  cards,
  entries,
  selected,
  draggedKeys,
  draggable,
  dropClassName,
  onOpen,
  onDragStart,
}: Props) {
  // The deck draws from index 0; other piles display their most recently added card.
  const top = zone === "deck" ? cards[0] : cards.at(-1);
  const entry = top && entries.get(top.entryId);
  const circle = CIRCLES.includes(zone);
  const hidden = zone === "deck" || zone === "ride" || top?.faceDown;
  const selectedHere = cards.some((card) => selected.includes(card.key));
  return (
    <button
      key={zone}
      type="button"
      data-drop-zone={zone}
      className={`pt-zone ${circle ? "pt-circle" : "pt-pile"} pt-${zone} ${selectedHere ? "is-selected" : ""} ${dropClassName} ${top?.rested ? "is-rested" : ""}`}
      aria-label={`View ${ZONES[zone]} (${cards.length})`}
      title={ZONES[zone]}
      onClick={() => onOpen(zone)}
    >
      <span className="pt-zone-title">
        {ZONES[zone]}
        <span>{cards.length || ""}</span>
      </span>
      <span className="pt-zone-surface">
        {top && entry?.card ? (
          <span
            className={`pt-miniature ${hidden ? "is-hidden" : ""} ${draggable ? "pt-draggable" : ""} ${draggedKeys.includes(top.key) ? "is-drag-source" : ""}`}
            onPointerDown={(event) => {
              if (draggable) onDragStart(event, top, Boolean(hidden));
            }}
          >
            {hidden ? (
              <Layers3 size={22} strokeWidth={1} />
            ) : (
              <CardArtwork card={entry.card} printing={entry.printing} />
            )}
          </span>
        ) : circle ? (
          <span className="pt-circle-mark">
            {zone === "vanguard" ? "V" : "R"}
          </span>
        ) : (
          <Plus size={18} strokeWidth={1} />
        )}
      </span>
      {top && !hidden && (
        <span className="pt-zone-caption" title={entry?.card?.name}>
          {circle ? (
            <>
              <span className="pt-unit-name">{entry?.card?.name}</span>
              {formatPower(top, entry?.card?.power)}{" "}
              <span> / ★{(entry?.card?.critical ?? 1) + top.critical}</span>
            </>
          ) : (
            entry?.card?.name
          )}
        </span>
      )}
      {top?.rested && <span className="pt-rest-label">Rest</span>}
    </button>
  );
}
