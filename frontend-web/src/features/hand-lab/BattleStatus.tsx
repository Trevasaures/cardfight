import { ArrowRight, Minus, Plus, Zap } from "lucide-react";
import { PHASES, ZONES, type TableSession, type Zone } from "./playtest";
import "./battle-status.css";

type Props = {
  session: TableSession;
  disabled: boolean;
  energyMax: number;
  nextLabel: string;
  onAdvance: () => void;
  onInspect: (zone: Zone) => void;
  onEnergy: (delta: number) => void;
};

/** A compact fight HUD; counters are shortcuts to the existing zone inspector. */
export function BattleStatus({
  session,
  disabled,
  energyMax,
  nextLabel,
  onAdvance,
  onInspect,
  onEnergy,
}: Props) {
  const yourTurn = session.active === "you";
  const availableDamage = session.zones.damage.filter(
    (card) => !card.faceDown,
  ).length;

  return (
    <div className="pt-battle-status">
      <div className="pt-turn-bar">
        <div className="pt-current-phase">
          <span>
            {yourTurn ? `Your turn ${session.turn}` : "Opponent's turn"}
          </span>
          <strong>{yourTurn ? session.phase : "Stand by"}</strong>
        </div>
        <div className="pt-phases" aria-label="Turn phases">
          {PHASES.map((phase) => (
            <span
              key={phase}
              aria-current={
                yourTurn && session.phase === phase ? "step" : undefined
              }
            >
              {phase}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="cinema-button"
          disabled={disabled || Boolean(session.check) || session.rules.pending.length > 0}
          onClick={onAdvance}
        >
          {nextLabel}
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="pt-resource-bar" aria-label="Table resources">
        {(["damage", "soul", "deck", "hand"] as const).map((zone) => (
          <button
            key={zone}
            type="button"
            className="pt-resource-counter"
            disabled={disabled}
            onClick={() => onInspect(zone)}
            aria-label={`Inspect ${ZONES[zone]}, ${session.zones[zone].length} cards${zone === "damage" ? `, ${availableDamage} face up` : ""}`}
          >
            <span>{ZONES[zone]}</span>
            <strong>{session.zones[zone].length}</strong>
            {zone === "damage" && (
              <small>
                CB <b>{availableDamage}</b>
              </small>
            )}
          </button>
        ))}
        <div className="pt-energy" role="group" aria-label="Energy">
          <Zap size={14} aria-hidden="true" />
          <span
            className="pt-energy-meter"
            role="meter"
            aria-label="Energy available"
            aria-valuenow={session.energy}
            aria-valuemin={0}
            aria-valuemax={energyMax}
          >
            {Array.from({ length: energyMax }, (_, index) => (
              <i
                key={index}
                className={index < session.energy ? "is-filled" : undefined}
              />
            ))}
          </span>
          <button
            type="button"
            disabled={disabled || !session.energy}
            onClick={() => onEnergy(-1)}
            aria-label="Spend one energy"
          >
            <Minus size={13} />
          </button>
          <strong>
            {session.energy}
            <small> / {energyMax}</small>
          </strong>
          <button
            type="button"
            disabled={disabled || session.energy >= energyMax}
            onClick={() => onEnergy(1)}
            aria-label="Gain one energy"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
