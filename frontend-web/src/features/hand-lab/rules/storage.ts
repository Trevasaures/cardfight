import { emptyRules, type RuleState } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validRules(value: unknown): value is RuleState {
  return isRecord(value) && isRecord(value.tokens) &&
    typeof value.tokens.energyGenerator === "boolean" &&
    typeof value.tokens.xceed === "boolean" &&
    Array.isArray(value.pending) && value.pending.every((choice) =>
      isRecord(choice) && choice.rule === "xceed" &&
      typeof choice.nonTriggerDamageCheck === "boolean");
}

/** Schema 1 had no rules or gauge zone. Upgrade every undo frame as well as
 * the live table, without replaying effects or enabling tokens retroactively. */
export function migrateRuleState(state: unknown): unknown {
  if (!isRecord(state) || !isRecord(state.history)) return state;
  function upgrade(value: unknown): unknown {
    if (
      !isRecord(value) || !isRecord(value.zones) || Number(value.energy) > 10
    ) return value;
    return {
      ...value,
      zones: { ...value.zones, gauge: [] },
      rules: emptyRules(),
    };
  }
  return {
    ...state,
    history: {
      ...state.history,
      present: upgrade(state.history.present),
      past: Array.isArray(state.history.past)
        ? state.history.past.map(upgrade) : state.history.past,
    },
  };
}
