import { ArrowRight, RotateCw, X } from "lucide-react";
import { CIRCLES, ZONES, type Zone, type CardChange } from "./playtest";

type Props = {
  selectedCount: number;
  playing: boolean;
  destination: Zone | "deckTop";
  onClear: () => void;
  onDestinationChange: (destination: Zone | "deckTop") => void;
  onMove: (to: Zone, position?: "top" | "bottom") => void;
  onChangeCards: (change: CardChange) => void;
};

export function SelectedCardActions({
  selectedCount,
  playing,
  destination,
  onClear,
  onDestinationChange,
  onMove,
  onChangeCards,
}: Props) {
  return (
    <div className="pt-selection" aria-label="Selected card actions">
      <div className="pt-selection-label">
        <strong>{selectedCount} selected</strong>
        <button
          type="button"
          className="hand-button"
          onClick={() => onClear()}
          aria-label="Clear card selection"
        >
          <X size={14} />
        </button>
      </div>
      {playing && (
        <div className="pt-selection-actions">
          <div className="pt-move-controls">
            <select
              className="workspace-control"
              aria-label="Move destination"
              value={destination}
              onChange={(event) =>
                onDestinationChange(event.target.value as Zone | "deckTop")
              }
            >
              {(Object.keys(ZONES) as Zone[]).map((zone) => (
                <option
                  key={zone}
                  value={zone}
                  disabled={CIRCLES.includes(zone) && selectedCount !== 1}
                >
                  {zone === "deck" ? "Deck bottom" : ZONES[zone]}
                </option>
              ))}
              <option value="deckTop">Deck top</option>
            </select>
            <button
              type="button"
              className="cinema-button"
              onClick={() =>
                onMove(
                  destination === "deckTop" ? "deck" : destination,
                  destination === "deckTop" ? "top" : "bottom",
                )
              }
            >
              Move
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="pt-card-state" role="group" aria-label="Card state">
            <button
              type="button"
              className="hand-button"
              onClick={() => onMove("drop")}
            >
              Discard
            </button>
            <button
              type="button"
              className="hand-button"
              onClick={() => onChangeCards("rest")}
            >
              <RotateCw size={14} />
              Rest / stand
            </button>
            <button
              type="button"
              className="hand-button"
              onClick={() => onChangeCards("flip")}
            >
              Flip
            </button>
          </div>
          <div className="pt-bonus" role="group" aria-label="Power bonus">
            <button
              type="button"
              className="hand-button"
              aria-label="Subtract 5000 power"
              onClick={() => onChangeCards("power-")}
            >
              −5k
            </button>
            <button
              type="button"
              className="hand-button"
              aria-label="Add 5000 power"
              onClick={() => onChangeCards("power+")}
            >
              +5k
            </button>
          </div>
          <div className="pt-bonus" role="group" aria-label="Critical bonus">
            <button
              type="button"
              className="hand-button"
              aria-label="Subtract one critical"
              onClick={() => onChangeCards("critical-")}
            >
              −★
            </button>
            <button
              type="button"
              className="hand-button"
              aria-label="Add one critical"
              onClick={() => onChangeCards("critical+")}
            >
              +★
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
