import { ArrowRight, ChevronDown, RotateCw, Swords, X } from "lucide-react";
import {
  ATTACK_CIRCLES,
  CIRCLES,
  ZONES,
  type Zone,
  type CardChange,
  type TableCard,
} from "./playtest";
import { CREST_DESTINATIONS } from "./crests";

type Props = {
  selection: { card: TableCard; zone: Zone }[];
  zones: readonly Zone[];
  playing: boolean;
  canAttack: boolean;
  onAttack: () => void;
  gUnitSelection: boolean;
  stridingVanguard: boolean;
  canReturnStride: boolean;
  canDropToGZone: boolean;
  canDropToGauge: boolean;
  strideTargetName?: string;
  canStride: boolean;
  canFaceUpGUnits: boolean;
  onStride: () => void;
  onFaceUpGUnits: () => void;
  destination: Zone | "deckTop";
  onClear: () => void;
  onRemoveTickets: () => void;
  onDestinationChange: (destination: Zone | "deckTop") => void;
  onMove: (to: Zone, position?: "top" | "bottom") => void;
  onChangeCards: (change: CardChange) => void;
};

const POWER_ACTIONS: {
  change: CardChange;
  label: string;
  description: string;
}[] = [
  { change: "power-", label: "−5k", description: "Subtract 5000 power" },
  { change: "power-2k", label: "−2k", description: "Subtract 2000 power" },
  { change: "power+2k", label: "+2k", description: "Add 2000 power" },
  { change: "power+", label: "+5k", description: "Add 5000 power" },
  { change: "power+10k", label: "+10k", description: "Add 10000 power" },
];

/** Keep normal game actions close; the sandbox's manual edits remain under More. */
export function SelectedCardActions({
  selection,
  zones,
  playing,
  canAttack,
  onAttack,
  gUnitSelection,
  stridingVanguard,
  canReturnStride,
  canDropToGZone,
  canDropToGauge,
  strideTargetName,
  canStride,
  canFaceUpGUnits,
  onStride,
  onFaceUpGUnits,
  destination,
  onClear,
  onRemoveTickets,
  onDestinationChange,
  onMove,
  onChangeCards,
}: Props) {
  const selectedCount = selection.length;
  const hasTicket = selection.some(({ card }) => card.ticket);
  const allTickets = selectedCount > 0 &&
    selection.every(({ card, zone }) => card.ticket && zone === "hand");
  const selectedAttacker =
    selectedCount === 1 &&
    !selection[0].card.crest &&
    ATTACK_CIRCLES.includes(selection[0].zone);
  const allIn = (zone: Zone) =>
    selectedCount > 0 && selection.every((item) => item.zone === zone);
  const allSoul = allIn("soul");
  const allDamage = allIn("damage");
  const allDrop = allIn("drop");
  const hasCrest = selection.some(({ card }) => card.crest);
  const hasGUnit =
    gUnitSelection ||
    stridingVanguard ||
    selection.some(({ card }) => card.gUnit);
  const allCrests =
    selectedCount > 0 && selection.every(({ card }) => card.crest);
  const allUnits =
    selectedCount > 0 &&
    !hasCrest &&
    selection.every(({ zone }) => CIRCLES.includes(zone));
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
  const discardLabel = allSoul ? "Soul blast" : allUnits ? "Retire" : "Discard";
  const deckBottomIsCommon =
    !allUnits && !allSoul && !allDamage && !hasCrest && !hasGUnit;
  // Derive a crest-only fallback without overwriting the normal-card preference.
  // Mixed selections keep their explicit destination and its validation.
  const effectiveDestination =
    allCrests &&
    (destination === "deckTop" || !CREST_DESTINATIONS.includes(destination))
      ? allIn("crest")
        ? "reserve"
        : "crest"
      : destination !== "deckTop" && !zones.includes(destination)
        ? "drop"
        : destination;
  const hasStrideTarget = Boolean(strideTargetName);
  const stridePlacement = hasStrideTarget && canStride;
  const invalidDestination =
    (effectiveDestination === "gauge" && !canDropToGauge) ||
    (hasGUnit && effectiveDestination === "crest") ||
    (hasGUnit && effectiveDestination === "g" && !canDropToGZone) ||
    ((gUnitSelection || hasStrideTarget) &&
      effectiveDestination === "vanguard" &&
      !canStride) ||
    (hasCrest &&
      (effectiveDestination === "deckTop" ||
        !CREST_DESTINATIONS.includes(effectiveDestination))) ||
    (effectiveDestination !== "deckTop" &&
      CIRCLES.includes(effectiveDestination) &&
      selectedCount !== 1 &&
      !(effectiveDestination === "vanguard" && stridePlacement));

  function powerButtons(positiveOnly: boolean) {
    return POWER_ACTIONS.filter(({ change }) => {
      if (change === "power+10k" && !allUnits) return false;
      return positiveOnly
        ? change.startsWith("power+")
        : !allUnits || change.startsWith("power-");
    }).map(({ change, label, description }) => (
      <button
        key={change}
        type="button"
        className="hand-button"
        aria-label={description}
        onClick={() => onChangeCards(change)}
      >
        {label}
      </button>
    ));
  }

  const restButton = (
    <button
      type="button"
      className="hand-button"
      onClick={() => onChangeCards("rest")}
    >
      <RotateCw size={14} /> {restLabel}
    </button>
  );
  const flipButton = (
    <button
      type="button"
      className="hand-button"
      onClick={() => onChangeCards("flip")}
    >
      {flipLabel}
    </button>
  );
  const deckBottomButton = (
    <button
      type="button"
      className="hand-button"
      onClick={() => onMove("deck", "bottom")}
    >
      Deck bottom
    </button>
  );

  return (
    <div className="pt-selection" aria-label="Selected card actions">
      <div className="pt-selection-label">
        <strong>{selectedCount} selected</strong>
        <button
          type="button"
          className="hand-button"
          onClick={onClear}
          aria-label="Clear card selection"
          aria-keyshortcuts="Escape"
          title="Clear selection · Esc"
        >
          <X size={14} />
        </button>
      </div>
      {playing && allTickets && (
        <button type="button" className="hand-button" onClick={onRemoveTickets}>
          {selectedCount === 1 ? "Remove ticket" : "Remove tickets"}
        </button>
      )}
      {playing && !hasTicket && (
        <div className="pt-selection-actions">
          <div
            className="pt-primary-actions"
            role="group"
            aria-label="Game actions"
          >
            {strideTargetName && (
              <button
                type="button"
                className="cinema-button"
                onClick={onStride}
                disabled={!canStride}
                aria-label={`Stride ${strideTargetName}`}
                title={`Stride ${strideTargetName} during your Ride or Main phase; costs and card conditions stay manual`}
              >
                <Swords size={14} /> Stride
              </button>
            )}
            {gUnitSelection && !allFaceUp && (
              <button
                type="button"
                className="hand-button"
                onClick={onFaceUpGUnits}
                disabled={!canFaceUpGUnits}
                title="Turn the selected G units face up for a cost"
              >
                Face up
              </button>
            )}
            {stridingVanguard && (
              <button
                type="button"
                className="hand-button"
                onClick={() => onMove("g")}
                disabled={!canReturnStride}
                title="Return the stride face up and restore its heart"
              >
                Return to G zone
              </button>
            )}
            {allCrests && (
              <button
                type="button"
                className="hand-button"
                onClick={() => onMove(allIn("crest") ? "reserve" : "crest")}
              >
                {allIn("crest") ? "To reserve" : "Activate"}
              </button>
            )}
            {selectedAttacker && (
              <button
                type="button"
                className="cinema-button"
                onClick={onAttack}
                disabled={!canAttack}
                title="Attack with this unit during your battle phase"
              >
                <Swords size={14} /> Attack
              </button>
            )}
            {!allDrop && !allDamage && !hasCrest && !hasGUnit && (
              <button
                type="button"
                className="hand-button"
                onClick={() => onMove("drop")}
              >
                {discardLabel}
              </button>
            )}
            {allUnits && restButton}
            {allDamage && flipButton}
            {deckBottomIsCommon && deckBottomButton}
          </div>
          <div className="pt-move-controls">
            <select
              className="workspace-control"
              aria-label="Move destination"
              value={effectiveDestination}
              onChange={(event) =>
                onDestinationChange(event.target.value as Zone | "deckTop")
              }
            >
              {zones.map((zone) => (
                <option
                  key={zone}
                  value={zone}
                  disabled={
                    ((gUnitSelection || hasStrideTarget) &&
                      zone === "vanguard" &&
                      !canStride) ||
                    (CIRCLES.includes(zone) &&
                      selectedCount !== 1 &&
                      !(zone === "vanguard" && stridePlacement)) ||
                    (hasCrest && !CREST_DESTINATIONS.includes(zone)) ||
                    (hasGUnit && zone === "crest") ||
                    (hasGUnit && zone === "g" && !canDropToGZone) ||
                    (zone === "gauge" && !canDropToGauge)
                  }
                >
                  {zone === "deck" ? "Deck bottom" : ZONES[zone]}
                </option>
              ))}
              <option value="deckTop" disabled={hasCrest}>
                Deck top
              </option>
            </select>
            <button
              type="button"
              className="cinema-button"
              disabled={invalidDestination}
              onClick={() =>
                onMove(
                  effectiveDestination === "deckTop"
                    ? "deck"
                    : effectiveDestination,
                  effectiveDestination === "deckTop" ? "top" : "bottom",
                )
              }
            >
              Move <ArrowRight size={14} />
            </button>
          </div>
          {allUnits && (
            <div
              className="pt-bonus pt-common-power"
              role="group"
              aria-label="Power bonus"
            >
              {powerButtons(true)}
            </div>
          )}
          <details className="pt-selection-more">
            <summary className="hand-button">
              More <ChevronDown size={14} />
            </summary>
            <div className="pt-manual-actions">
              <div
                className="pt-card-state"
                role="group"
                aria-label="Manual card state"
              >
                {allDamage && (
                  <button
                    type="button"
                    className="hand-button"
                    onClick={() => onMove("drop")}
                  >
                    {discardLabel}
                  </button>
                )}
                {gUnitSelection && (
                  <button
                    type="button"
                    className="hand-button"
                    onClick={() => onMove("drop")}
                  >
                    Discard
                  </button>
                )}
                {!deckBottomIsCommon && !hasCrest && deckBottomButton}
                {!allUnits && !hasCrest && restButton}
                {!allDamage && flipButton}
              </div>
              {!hasCrest && (
                <div
                  className="pt-bonus pt-power-bonus"
                  role="group"
                  aria-label="Manual power bonus"
                >
                  {powerButtons(false)}
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
              )}
              {!hasCrest && (
                <div
                  className="pt-bonus"
                  role="group"
                  aria-label="Critical bonus"
                >
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
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
