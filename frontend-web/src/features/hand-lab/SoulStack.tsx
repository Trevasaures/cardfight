import type { CSSProperties } from "react";
import { Layers3 } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import type { TableCard } from "./playtest";

type Props = {
  cards: TableCard[];
  entries: Map<number, DeckCardEntry>;
};

/** Mirror the soul's bottom-to-top order; the active vanguard renders above it. */
export function SoulStack({ cards, entries }: Props) {
  // Compress large stacks within the circle while retaining one layer per copy.
  const spacing = Math.min(5, 30 / Math.max(1, cards.length));
  return (
    <span className="pt-soul-stack" aria-hidden="true">
      {cards.map((card, index) => {
        const entry = entries.get(card.entryId);
        return (
          <span
            key={card.key}
            className="pt-soul-layer"
            style={
              {
                "--soul-offset": `${(cards.length - index) * spacing}px`,
              } as CSSProperties
            }
          >
            {entry?.card && !card.faceDown ? (
              <CardArtwork card={entry.card} printing={entry.printing} />
            ) : (
              <Layers3 size={20} />
            )}
          </span>
        );
      })}
    </span>
  );
}
