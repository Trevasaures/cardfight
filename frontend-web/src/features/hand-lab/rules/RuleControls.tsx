import { useState } from "react";
import type { TableSession, Zone } from "../playtest";
import { ritualCount } from "./luard";
import { resolveXceed } from "./impauldio";
import { setRuleToken } from "./index";
import { hasRuleToken, type RuleContext } from "./types";
import { ruleVisibility } from "./visibility";
import "./rules.css";

type Props = {
  context: RuleContext;
  disabled: boolean;
  onApply: (next: TableSession) => void;
  onInspect: (zone: Zone) => void;
};

function GaugeChoice({ context, disabled, onApply }: Omit<Props, "onInspect">) {
  const [chosen, setChosen] = useState("");
  const drop = context.session.zones.drop;
  const empty = drop.length === 0;
  const valid = drop.some((card) => card.key === chosen);
  return (
    <div className="pt-rule-choice" role="group" aria-label="Resolve X-ceed">
      <strong>X-ceed</strong>
      {empty ? (
        <span>Drop empty</span>
      ) : (
        <select
          className="workspace-control"
          aria-label="AutoMOD card from drop"
          value={valid ? chosen : ""}
          disabled={disabled}
          onChange={(event) => setChosen(event.target.value)}
        >
          <option value="">Choose from drop…</option>
          {drop.map((card) => (
            <option key={card.key} value={card.key}>
              {context.entries.get(card.entryId)?.card?.name} · #
              {Number(card.key.split(":")[1]) + 1}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="cinema-button"
        disabled={disabled || (!empty && !valid)}
        onClick={() => {
          onApply(resolveXceed(context, empty ? null : chosen));
          setChosen("");
        }}
      >
        {empty ? "Resolve" : "Add gauge"}
      </button>
      {context.session.rules.pending.length > 1 && (
        <small>{context.session.rules.pending.length} pending</small>
      )}
    </div>
  );
}

/** Show the deck's rule counters; only unresolved choices interrupt the table. */
export function RuleControls({ context, disabled, onApply, onInspect }: Props) {
  const { session } = context;
  const visibility = ruleVisibility(context);
  if (!visibility.ritual && !visibility.impauldio && !visibility.pendingXceed) {
    return null;
  }
  return (
    <div className="pt-rules">
      <div className="pt-rule-counters">
        {visibility.ritual && (
          <button
            type="button"
            className="pt-resource-counter"
            disabled={disabled}
            title="Grade 1 cards in drop, including supported grade modifiers"
            onClick={() => onInspect("drop")}
          >
            Ritual <strong>{ritualCount(context)}</strong>
          </button>
        )}
        {visibility.impauldio && (
          <button
            type="button"
            className="pt-resource-counter"
            disabled={disabled}
            data-drop-zone="gauge"
            onClick={() => onInspect("gauge")}
            aria-label={`Inspect AutoMOD, ${session.zones.gauge.length} cards`}
          >
            AutoMOD <strong>{session.zones.gauge.length}</strong>
          </button>
        )}
        {visibility.impauldio && !hasRuleToken(context, "xceed") && (
          <details className="pt-rule-tokens">
            <summary>X-ceed</summary>
            <fieldset disabled={disabled}>
              <legend className="sr-only">Virtual tokens in play</legend>
              <label>
                <input
                  type="checkbox"
                  checked={session.rules.tokens.xceed}
                  onChange={(event) =>
                    onApply(setRuleToken(session, "xceed", event.target.checked))
                  }
                />
                SYSTEM CODE: X-ceed
              </label>
              <small>Manual setup</small>
            </fieldset>
          </details>
        )}
      </div>
      {visibility.pendingXceed && (
        <GaugeChoice context={context} disabled={disabled} onApply={onApply} />
      )}
    </div>
  );
}
