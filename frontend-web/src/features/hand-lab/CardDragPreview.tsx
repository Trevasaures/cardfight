import { createPortal } from "react-dom";
import { Layers3 } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import { CIRCLES, ZONES } from "./playtest";
import type { DragView } from "./useCardDrag";
import { CREST_DESTINATIONS, isCrestEntry } from "./crests";

type Props = { drag: DragView; entry: DeckCardEntry | undefined; hint?: string };

function getDropHint(drag: DragView, entry: DeckCardEntry | undefined): string {
  if (!drag.target) return "Release to cancel";
  if (drag.valid) {
    const destination =
      drag.target === "deck" ? "Deck bottom" : ZONES[drag.target];
    return `→ ${destination}`;
  }
  if (isCrestEntry(entry) && !CREST_DESTINATIONS.includes(drag.target)) {
    return "Crest or Reserve only";
  }
  if (CIRCLES.includes(drag.target) && drag.keys.length > 1) {
    return "One card per circle";
  }
  return "Cannot move here";
}

// A portal avoids clipping the dragged card inside the hand or playmat scrollers.
export function CardDragPreview({ drag, entry, hint }: Props) {
  return createPortal(
    <div
      className={`pt-drag-preview ${isCrestEntry(entry) ? "is-crest" : ""} ${drag.target && !drag.valid ? "is-invalid" : ""}`}
      style={{
        left: Math.max(8, Math.min(drag.x + 16, window.innerWidth - 140)),
        top: Math.max(8, Math.min(drag.y + 16, window.innerHeight - 225)),
      }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pt-drag-art" aria-hidden="true">
        {drag.hidden || !entry?.card ? (
          <Layers3 size={28} />
        ) : (
          <CardArtwork card={entry.card} printing={entry.printing} />
        )}
        {drag.keys.length > 1 && <strong>×{drag.keys.length}</strong>}
      </div>
      <span>
        {drag.keys.length > 1
          ? `${drag.keys.length} cards`
          : drag.hidden
            ? "Card"
            : entry?.card?.name}
      </span>
      <strong>{hint ?? getDropHint(drag, entry)}</strong>
    </div>,
    document.body,
  );
}
