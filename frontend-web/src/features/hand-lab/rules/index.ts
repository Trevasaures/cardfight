import type { DeckCardEntry } from "../../../types/api.ts";
import type { TableSession } from "../playtest.ts";
import { applyRideXceed, damageChoices } from "./impauldio.ts";
import { applyEnergyGenerator } from "./energy.ts";
import { energyLimit } from "./wirbel.ts";

export { energyLimit } from "./wirbel.ts";
export { effectiveGrade, ritualCount, hasRitualDeck } from "./luard.ts";
export { canResolveXceed, resolveXceed, xceedPowerBonus } from "./impauldio.ts";
export { hasRuleToken } from "./types.ts";
export { setRuleToken } from "./tokens.ts";
export * from "./persona.ts";
export { emptyPersona } from "./personaTypes.ts";
export type { PersonaState } from "./personaTypes.ts";

/** The table calls this once per completed action, before saving its undo snapshot.
 * Pure derivations live in the deck modules; only reactions are recorded here.
 * Undo/restore bypass this function so historical effects are never replayed. */
export function applyRules(
  before: TableSession,
  after: TableSession,
  entries: ReadonlyMap<number, DeckCardEntry>,
): TableSession {
  if (after === before) return before;
  let next = applyEnergyGenerator(before, { session: after, entries });
  next = applyRideXceed(before, { session: next, entries });
  const context = { session: next, entries };
  const choices = damageChoices(before, context);
  const energy = Math.min(next.energy, energyLimit(context));
  if (!choices.length && energy === next.energy) return next;
  return {
    ...next,
    energy,
    rules: { ...next.rules, pending: [...next.rules.pending, ...choices] },
  };
}
