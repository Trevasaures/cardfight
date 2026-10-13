import { ArrowRight } from "lucide-react";
import { PHASES, ZONES, type TableSession, type Zone } from "./playtest";
import { soulCards } from "./stride";
import "./battle-status.css";

type Props = {
  session: TableSession;
  disabled: boolean;
  nextLabel: string;
  onAdvance: () => void;
  onInspect: (zone: Zone) => void;
};

/** A compact fight HUD; counters are shortcuts to the existing zone inspector. */
export function BattleStatus({
  session,
  disabled,
  nextLabel,
  onAdvance,
  onInspect,
}: Props) {
  const yourTurn = session.active === "you";
  const availableDamage = session.zones.damage.filter(
    (card) => !card.faceDown,
  ).length;
  const soulCount = soulCards(session).length;

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
          disabled={
            disabled || Boolean(session.check) || session.rules.pending.length > 0
          }
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
            aria-label={`Inspect ${ZONES[zone]}, ${zone === "soul" ? soulCount : session.zones[zone].length} cards${zone === "damage" ? `, ${availableDamage} face up` : ""}`}
          >
            <span>{ZONES[zone]}</span>
            <strong>
              {zone === "soul" ? soulCount : session.zones[zone].length}
            </strong>
            {zone === "damage" && (
              <small>
                CB <b>{availableDamage}</b>
              </small>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
