import type { DeckCardEntry } from "../../../types/api.ts";
import type { TableSession } from "../playtest.ts";
import { damageChoices } from "./impauldio.ts";
import { energyLimit } from "./wirbel.ts";
import type { RuleToken } from "./types.ts";

export { energyLimit } from "./wirbel.ts";
export { effectiveGrade, ritualCount, hasRitualDeck } from "./luard.ts";
export { resolveXceed } from "./impauldio.ts";
export { hasRuleToken } from "./types.ts";

/** The table calls this once per completed action, before saving its undo snapshot.
 * Pure derivations live in the deck modules; only reactions are recorded here.
 * Undo/restore bypass this function so historical effects are never replayed. */
export function applyRules(
  before: TableSession,
  after: TableSession,
  entries: ReadonlyMap<number, DeckCardEntry>,
): TableSession {
  if (after === before) return before;
  const context = { session: after, entries };
  const choices = damageChoices(before, context);
  const energy = Math.min(after.energy, energyLimit(context));
  if (!choices.length && energy === after.energy) return after;
  return {
    ...after,
    energy,
    rules: { ...after.rules, pending: [...after.rules.pending, ...choices] },
  };
}

export function setRuleToken(
  session: TableSession,
  token: RuleToken,
  enabled: boolean,
): TableSession {
  if (
    session.phase === "mulligan" || session.rules.tokens[token] === enabled
  ) return session;
  const name = token === "energyGenerator"
    ? "Energy Generator" : "SYSTEM CODE: X-ceed";
  return {
    ...session,
    rules: { ...session.rules, tokens: { ...session.rules.tokens, [token]: enabled } },
    log: [...session.log.slice(-39), `${name} ${enabled ? "placed" : "removed"}.`],
  };
}
