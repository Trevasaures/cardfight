import { useState } from "react";
import type { TableSession, Zone } from "../playtest";
import { hasRitualDeck, ritualCount } from "./luard";
import { resolveXceed } from "./impauldio";
import { setRuleToken } from "./index";
import { hasRuleToken, type RuleContext } from "./types";
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
      {empty ? <span>Drop empty</span> : (
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
              {context.entries.get(card.entryId)?.card?.name} · #{Number(card.key.split(":")[1]) + 1}
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

/** Keep counters visible and token setup tucked away; no card-text parser runs here. */
export function RuleControls({ context, disabled, onApply, onInspect }: Props) {
  const { session } = context;
  const ritual = hasRitualDeck(context);
  const xceed = hasRuleToken(context, "xceed");
  return (
    <div className="pt-rules">
      <div className="pt-rule-counters">
        {ritual && (
          <button
            type="button" className="pt-resource-counter" disabled={disabled}
            title="Grade 1 cards in drop, including supported grade modifiers"
            onClick={() => onInspect("drop")}
          >
            Ritual <strong>{ritualCount(context)}</strong>
          </button>
        )}
        {(xceed || session.zones.gauge.length > 0) && (
          <button
            type="button" className="pt-resource-counter" disabled={disabled}
            data-drop-zone="gauge" onClick={() => onInspect("gauge")}
            aria-label={`Inspect AutoMOD, ${session.zones.gauge.length} cards`}
          >
            AutoMOD <strong>{session.zones.gauge.length}</strong>
          </button>
        )}
        <details className="pt-rule-tokens">
          <summary>Rule tokens</summary>
          <fieldset disabled={disabled}>
            <legend className="sr-only">Virtual tokens in play</legend>
            {(["energyGenerator", "xceed"] as const).map((token) => (
              <label key={token}>
                <input
                  type="checkbox"
                  checked={session.rules.tokens[token]}
                  onChange={(event) => onApply(setRuleToken(session, token, event.target.checked))}
                />
                {token === "energyGenerator" ? "Energy Generator · Crest" : "SYSTEM CODE: X-ceed · Order"}
              </label>
            ))}
            <small>Place when gained. Other abilities and costs stay manual.</small>
          </fieldset>
        </details>
      </div>
      {session.rules.pending.length > 0 && (
        <GaugeChoice context={context} disabled={disabled} onApply={onApply} />
      )}
    </div>
  );
}
