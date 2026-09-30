import { useState } from "react";
import { ChevronDown, Zap } from "lucide-react";
import type { TableSession } from "./playtest";
import {
  POWER_TARGETS,
  powerEffectAmount,
  powerMultiplierCount,
  powerTargetKeys,
  type PowerEffect,
  type PowerMultiplier,
  type PowerTarget,
} from "./powerEffects";
import "./power-controls.css";

type Props = {
  session: TableSession;
  selected: string[];
  disabled: boolean;
  onApply: (effect: PowerEffect) => void;
};

/** Manual effect calculator: preview the targets and bonus before applying once. */
export function PowerControls({ session, selected, disabled, onApply }: Props) {
  const [target, setTarget] = useState<PowerTarget>("front");
  const [amount, setAmount] = useState("10000");
  const [multiplier, setMultiplier] = useState<PowerMultiplier>("manual");
  const [manualCount, setManualCount] = useState("1");
  const count = powerMultiplierCount(session, multiplier, Number(manualCount));
  const total = powerEffectAmount(Number(amount), count);
  const targets = powerTargetKeys(session, target, selected);
  const frontCount = powerTargetKeys(session, "front", selected).length;

  return (
    <div className="pt-power-controls" aria-label="Field power controls">
      <button
        type="button"
        className="hand-button"
        disabled={disabled || !frontCount}
        title={`Add 10,000 power to ${frontCount} current front-row units`}
        onClick={() =>
          onApply({
            target: "front",
            amount: 10000,
            multiplier: "manual",
            count: 1,
          })
        }
      >
        <Zap size={14} /> Front row +10k
      </button>
      <details className="pt-power-custom">
        <summary className="hand-button">
          Power <ChevronDown size={14} />
        </summary>
        <fieldset disabled={disabled}>
          <legend className="sr-only">Custom power effect</legend>
          <div className="pt-power-inputs">
            <label>
              Target
              <select
                className="workspace-control"
                aria-label="Power target"
                value={target}
                onChange={(event) =>
                  setTarget(event.target.value as PowerTarget)
                }
              >
                {(Object.keys(POWER_TARGETS) as PowerTarget[]).map((value) => (
                  <option key={value} value={value}>
                    {POWER_TARGETS[value]} ·{" "}
                    {powerTargetKeys(session, value, selected).length}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Power
              <input
                className="workspace-control"
                type="number"
                step="1"
                aria-label="Power per unit"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label>
              Multiply by
              <select
                className="workspace-control"
                aria-label="Power count source"
                value={multiplier}
                onChange={(event) =>
                  setMultiplier(event.target.value as PowerMultiplier)
                }
              >
                <option value="manual">Custom count</option>
                <option value="gTotal">G-zone cards</option>
                <option value="gFaceUp">Face-up G-zone cards</option>
              </select>
            </label>
            <label>
              Count
              <input
                className="workspace-control"
                type="number"
                min={multiplier === "manual" ? 1 : 0}
                step="1"
                aria-label="Power multiplier"
                readOnly={multiplier !== "manual"}
                value={multiplier === "manual" ? manualCount : count}
                onChange={(event) => setManualCount(event.target.value)}
              />
            </label>
          </div>
          <div className="pt-power-apply">
            <output aria-live="polite">
              {multiplier !== "manual" && count === 0
                ? `No ${multiplier === "gFaceUp" ? "face-up " : ""}G-zone cards.`
                : total === null
                  ? "Choose a whole-number bonus and a positive count."
                  : `${targets.length} ${targets.length === 1 ? "unit" : "units"} · ${total > 0 ? "+" : ""}${total.toLocaleString()} each`}
            </output>
            <button
              type="button"
              className="cinema-button"
              disabled={total === null || !targets.length}
              onClick={() =>
                onApply({
                  target,
                  amount: Number(amount),
                  multiplier,
                  count: Number(manualCount),
                })
              }
            >
              Apply power
            </button>
          </div>
        </fieldset>
      </details>
    </div>
  );
}
