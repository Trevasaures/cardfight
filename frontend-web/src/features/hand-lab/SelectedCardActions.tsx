import { ArrowRight, RotateCw, Swords, X } from "lucide-react";
import {
  ATTACK_CIRCLES,
  CIRCLES,
  ZONES,
  type Zone,
  type CardChange,
  type TableCard,
} from "./playtest";

type Props = {
  selection: { card: TableCard; zone: Zone }[];
  playing: boolean;
  canAttack: boolean;
  onAttack: () => void;
  destination: Zone | "deckTop";
  onClear: () => void;
  onDestinationChange: (destination: Zone | "deckTop") => void;
  onMove: (to: Zone, position?: "top" | "bottom") => void;
  onChangeCards: (change: CardChange) => void;
};

export function SelectedCardActions({
  selection,
  playing,
  canAttack,
  onAttack,
  destination,
  onClear,
  onDestinationChange,
  onMove,
  onChangeCards,
}: Props) {
  const selectedCount = selection.length;
  const selectedAttacker =
    selectedCount === 1 && ATTACK_CIRCLES.includes(selection[0].zone);
  const allSoul =
    selectedCount > 0 && selection.every(({ zone }) => zone === "soul");
  const allUnits =
    selectedCount > 0 && selection.every(({ zone }) => CIRCLES.includes(zone));
  const allDamage =
    selectedCount > 0 && selection.every(({ zone }) => zone === "damage");
  const allFaceDown = selection.every(({ card }) => card.faceDown);
  const allFaceUp = selection.every(({ card }) => !card.faceDown);
  const flipLabel =
    allDamage && allFaceUp
      ? "Counter blast"
      : allDamage && allFaceDown
        ? "Counter charge"
        : "Flip";
  const restLabel =
    selectedCount === 1
      ? selection[0].card.rested
        ? "Stand"
        : "Rest"
      : "Rest / stand";

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
        <div
          className={`pt-selection-actions ${selectedAttacker ? "has-attack" : ""}`}
        >
          {selectedAttacker && (
            <button
              type="button"
              className="cinema-button"
              onClick={onAttack}
              disabled={!canAttack}
              title="Attack with this unit during your battle phase"
            >
              <Swords size={14} />
              Attack
            </button>
          )}
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
              {allSoul ? "Soul blast" : allUnits ? "Retire" : "Discard"}
            </button>
            <button
              type="button"
              className="hand-button"
              title="Put selected cards on the bottom of the deck"
              onClick={() => onMove("deck", "bottom")}
            >
              Deck bottom
            </button>
            <button
              type="button"
              className="hand-button"
              onClick={() => onChangeCards("rest")}
            >
              <RotateCw size={14} />
              {restLabel}
            </button>
            <button
              type="button"
              className="hand-button"
              onClick={() => onChangeCards("flip")}
            >
              {flipLabel}
            </button>
          </div>
          <div
            className="pt-bonus pt-power-bonus"
            role="group"
            aria-label="Power bonus"
          >
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
              aria-label="Subtract 2000 power"
              onClick={() => onChangeCards("power-2k")}
            >
              −2k
            </button>
            <button
              type="button"
              className="hand-button"
              aria-label="Add 2000 power"
              onClick={() => onChangeCards("power+2k")}
            >
              +2k
            </button>
            <button
              type="button"
              className="hand-button"
              aria-label="Add 5000 power"
              onClick={() => onChangeCards("power+")}
            >
              +5k
            </button>
            <button
              type="button"
              className="hand-button"
              aria-label="Add 100 million power"
              title="Add 100,000,000 power to one selected unit"
              disabled={!allUnits || selectedCount !== 1}
              onClick={() => onChangeCards("power+100m")}
            >
              +100M
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
