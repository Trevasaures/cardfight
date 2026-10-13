import { Plus } from "lucide-react";
import type { Card, DeckCardZone, DeckVersion } from "../../types/api";
import { cardGradeBadge, isCrestCard } from "../../utils/cards";
import { cardAdditionIssue, suggestedDeckCardZone } from "./deckCardSelection";

type Props = {
  currentVersion: DeckVersion | null;
  selectedCard: Card | null;
  selectedPrintingId: string;
  addQuantity: number;
  addZone: DeckCardZone;
  saving: boolean;
  onSelectedPrintingIdChange: (value: string) => void;
  onAddQuantityChange: (value: number) => void;
  onAddZoneChange: (value: DeckCardZone) => void;
  onAddCardToVersion: () => void;
};

export function DeckCardComposer({
  currentVersion,
  selectedCard,
  selectedPrintingId,
  addQuantity,
  addZone,
  saving,
  onSelectedPrintingIdChange,
  onAddQuantityChange,
  onAddZoneChange,
  onAddCardToVersion,
}: Props) {
  if (!selectedCard) return null;
  const isCrest = isCrestCard(selectedCard);
  const destination = suggestedDeckCardZone(selectedCard, addZone);
  const quantity = isCrest ? 1 : addQuantity;
  const issue = cardAdditionIssue(
    currentVersion,
    selectedCard,
    destination,
    quantity,
  );

  return (
    <div className="builder-add-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <strong className="min-w-0 truncate text-xs" title={selectedCard.name}>
          {selectedCard.name}
        </strong>
        <span className="collection-muted shrink-0">
          {cardGradeBadge(selectedCard)}
        </span>
      </div>
      <label className="mb-3 block">
        <span className="collection-label">Printing</span>
        <select
          value={selectedPrintingId}
          onChange={(event) => onSelectedPrintingIdChange(event.target.value)}
          className="workspace-control w-full"
        >
          {!selectedCard.printings.length && (
            <option value="">No printing recorded</option>
          )}
          {selectedCard.printings.map((printing) => (
            <option key={printing.id} value={printing.id}>
              {[printing.set_code, printing.card_number, printing.rarity]
                .filter(Boolean)
                .join(" · ") || `Printing ${printing.id}`}
            </option>
          ))}
        </select>
      </label>
      <div className="builder-add-fields">
        <label>
          <span className="collection-label">Zone</span>
          <select
            value={destination}
            disabled={isCrest}
            onChange={(event) =>
              onAddZoneChange(event.target.value as DeckCardZone)
            }
            className="workspace-control w-full"
          >
            {isCrest ? (
              <option value="crest">Crests</option>
            ) : (
              <>
                <option value="main">Main deck</option>
                <option value="ride">Ride deck</option>
                <option value="g">G zone</option>
                <option value="token">Tokens</option>
                <option value="other">Other</option>
              </>
            )}
          </select>
        </label>
        <label>
          <span className="collection-label">Copies</span>
          <input
            type="number"
            min={1}
            max={destination === "ride" || isCrest ? 1 : undefined}
            readOnly={destination === "ride" || isCrest}
            value={quantity}
            onChange={(event) =>
              onAddQuantityChange(Number(event.target.value))
            }
            className="workspace-control w-full"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={onAddCardToVersion}
        disabled={
          !currentVersion ||
          saving ||
          !!issue ||
          !Number.isInteger(quantity) ||
          quantity < 1
        }
        className="collection-button primary mt-3 w-full"
      >
        <Plus />{" "}
        {isCrest
          ? "Add crest"
          : `Add ${quantity} ${quantity === 1 ? "copy" : "copies"}`}
      </button>
      {issue && (
        <p className="mt-2 text-xs text-cyan-200" role="status">
          {issue}
        </p>
      )}
    </div>
  );
}
