import { changePower, moveCards, type TableSession } from "../playtest.ts";
import { hasRuleToken, type RuleContext, type RuleState } from "./types.ts";

/** Observe arrivals, not damage count: healing or turning a damage card over
 * must not retrigger X-ceed. A batch of arrivals creates ordered choices. */
export function damageChoices(
  before: TableSession,
  context: RuleContext,
): RuleState["pending"] {
  const { session, entries } = context;
  if (session.active !== "opponent" || !hasRuleToken(context, "xceed")) return [];
  const existing = new Set(before.zones.damage.map((card) => card.key));
  return session.zones.damage
    .filter((card) => !existing.has(card.key))
    .map((card) => {
      const checked =
        before.check?.kind === "damage" && before.check.key === card.key;
      const definition = entries.get(card.entryId)?.card;
      const trigger = Boolean(definition?.trigger_type) ||
        /trigger/i.test(definition?.card_type ?? "");
      return {
        rule: "xceed",
        nonTriggerDamageCheck: Boolean(checked && definition && !trigger),
      };
    });
}

/** Resolve one queued ability after the player chooses a physical drop copy.
 * Gauge count is checked AFTER that move, including the transition from 3 to 4.
 * Trigger power, healing, and other trigger effects remain the player's choice. */
export function resolveXceed(
  context: RuleContext,
  key: string | null,
): TableSession {
  const { session } = context;
  const pending = session.rules.pending[0];
  if (!pending || session.phase === "mulligan") return session;
  const validChoice = key === null
    ? session.zones.drop.length === 0
    : session.zones.drop.some((card) => card.key === key);
  if (!validChoice) return session;

  let next = key === null ? session : moveCards(session, [key], "gauge");
  const bonus = next.zones.gauge.length >= 4 || pending.nonTriggerDamageCheck;
  const vanguard = next.zones.vanguard[0];
  if (bonus && vanguard) next = changePower(next, [vanguard.key], 5000);
  const message = `X-ceed · ${key ? "AutoMOD +1" : "drop empty"}${bonus && vanguard ? " · Vanguard +5,000" : ""}.`;
  return {
    ...next,
    rules: { ...next.rules, pending: next.rules.pending.slice(1) },
    log: [...next.log.slice(-39), message],
  };
}
