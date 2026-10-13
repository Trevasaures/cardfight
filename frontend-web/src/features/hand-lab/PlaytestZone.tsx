import type { PointerEvent } from "react";
import { Layers3, Plus } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import { CIRCLES, ZONES, type TableCard, type Zone } from "./playtest";
import { formatPower } from "./cardDisplay";
import { SoulStack } from "./SoulStack";
import { isSelectionClick, zoneCardTarget } from "./selection";
import "./vanguard-stack.css";

type Props = {
  zone: Zone;
  cards: TableCard[];
  entries: Map<number, DeckCardEntry>;
  selected: string[];
  draggedKeys: string[];
  draggable: boolean;
  dropClassName: string;
  soul?: TableCard[];
  heart?: TableCard;
  soulDropClassName?: string;
  onOpen: (zone: Zone) => void;
  onSelect: (card: TableCard) => void;
  onRest: (card: TableCard) => void;
  onDragStart: (
    event: PointerEvent<HTMLElement>,
    card: TableCard,
    hidden: boolean,
  ) => void;
};

/** A circle or pile keeps the same drop target whether it is empty or occupied. */
export function PlaytestZone({
  zone,
  cards,
  entries,
  selected,
  draggedKeys,
  draggable,
  dropClassName,
  soul = [],
  heart,
  soulDropClassName = "",
  onOpen,
  onSelect,
  onRest,
  onDragStart,
}: Props) {
  // The deck draws from index 0; other piles display their most recently added card.
  const top = zone === "deck" ? cards[0] : cards.at(-1);
  const entry = top && entries.get(top.entryId);
  const heartName = heart && entries.get(heart.entryId)?.card?.name;
  const circle = CIRCLES.includes(zone);
  const hidden = zone === "deck" || zone === "ride" || top?.faceDown;
  const unitName =
    circle || zone === "guardian" ? entry?.card?.name : undefined;
  const title = unitName ?? ZONES[zone];
  const selectedHere = cards.some((card) => selected.includes(card.key));
  const restable = Boolean(circle && top && !top.crest && draggable);
  const tooltip = [
    unitName ? `${unitName} · ${ZONES[zone]}` : title,
    restable ? `Double-click to ${top?.rested ? "stand" : "rest"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const zoneButton = (
    <button
      key={zone}
      type="button"
      data-drop-zone={zone}
      className={`pt-zone ${circle ? "pt-circle" : "pt-pile"} pt-${zone} ${unitName ? "has-unit" : ""} ${selectedHere ? "is-selected" : ""} ${dropClassName} ${top?.rested ? "is-rested" : ""}`}
      aria-label={
        circle && top && draggable
          ? `${selected.includes(top.key) ? "Deselect" : "Select"} ${unitName ?? "unit"} in ${ZONES[zone]}`
          : `View ${ZONES[zone]} (${cards.length})`
      }
      aria-pressed={
        circle && top && draggable ? selected.includes(top.key) : undefined
      }
      title={tooltip}
      onClick={(event) => {
        if (!isSelectionClick(event.detail, restable)) return;
        const artworkClicked =
          event.target instanceof Element &&
          Boolean(event.target.closest("[data-zone-card]"));
        const target = draggable && zoneCardTarget(zone, top, artworkClicked);
        if (target) onSelect(target);
        else onOpen(zone);
      }}
      onDoubleClick={() => {
        if (restable && top) onRest(top);
      }}
    >
      <span className="pt-zone-title">
        {title}
        {!circle && (!unitName || cards.length > 1) && (
          <span>{cards.length || ""}</span>
        )}
      </span>
      {zone === "vanguard" && heart && (
        <span className="pt-heart-label" title={heartName}>
          Heart <strong>{heartName ?? "Vanguard"}</strong>
        </span>
      )}
      <span className="pt-zone-surface">
        {zone === "vanguard" && (soul.length > 0 || heart) && (
          <SoulStack cards={heart ? [...soul, heart] : soul} entries={entries} />
        )}
        {top && entry?.card ? (
          <span
            data-zone-card
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
            {circle && (
              <span className="pt-unit-role" aria-hidden="true">
                {zone === "vanguard" ? "V" : "R"}
              </span>
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
      {top && !hidden && (circle || !unitName) && (
        <span className="pt-zone-caption">
          {circle ? (
            <>
              <span className="pt-unit-grade">
                G{entry?.card?.grade ?? "?"}
              </span>
              <strong
                className={top.power ? "has-bonus" : undefined}
                title={formatPower(top, entry?.card?.power)}
                aria-label={`Power ${formatPower(top, entry?.card?.power)}`}
              >
                {formatPower(top, entry?.card?.power, true)}
              </strong>
              <span className={top.critical ? "has-bonus" : undefined}>
                ★{(entry?.card?.critical ?? 1) + top.critical}
              </span>
            </>
          ) : (
            entry?.card?.name
          )}
        </span>
      )}
      {top?.rested && <span className="pt-rest-label">Rest</span>}
    </button>
  );

  if (zone !== "vanguard") return zoneButton;
  const next = soul.at(-1);
  const nextName = next && entries.get(next.entryId)?.card?.name;
  return (
    <div className="pt-vanguard-stack">
      {zoneButton}
      <button
        type="button"
        className={`pt-soul-count ${soulDropClassName}`}
        data-drop-zone="soul"
        onClick={() => onOpen("soul")}
        aria-label={`View Soul (${soul.length})`}
        title={nextName ? `Next in stack: ${nextName}` : "Soul"}
      >
        <Layers3 size={12} /> Soul <strong>{soul.length}</strong>
      </button>
    </div>
  );
}
