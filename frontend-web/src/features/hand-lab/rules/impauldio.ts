import { changePower, moveCards, type TableSession } from "../playtest.ts";
import { cardName, hasRuleToken, type RuleContext, type RuleState } from "./types.ts";
import { supportsImpauldio } from "./visibility.ts";
import { normalRide } from "./rides.ts";
import { setRuleToken } from "./tokens.ts";

/** Original DZ-BT04/088: reveal a grade 3 Impauldio still in the ride deck.
 * The reveal ends after resolving, so neither its zone nor orientation changes. */
export function applyRideXceed(
  before: TableSession,
  context: RuleContext,
): TableSession {
  const { session, entries } = context;
  const ride = normalRide(before, session, entries);
  if (
    !ride ||
    cardName(entries.get(ride.current.entryId)?.card?.name) !== "inno progrett" ||
    entries.get(ride.current.entryId)?.card?.grade !== 1 ||
    entries.get(ride.previous.entryId)?.card?.grade !== 0 ||
    hasRuleToken(context, "xceed")
  ) return session;
  const reveal = session.zones.ride.find((card) => {
    const definition = entries.get(card.entryId)?.card;
    return definition?.grade === 3 && /\bimpauldio\b/.test(cardName(definition.name));
  });
  if (!reveal) return session;
  const printedToken = [...session.zones.token, ...session.zones.reserve].find(
    (card) => cardName(entries.get(card.entryId)?.card?.name).replace(/\s/g, "") ===
      "systemcode:x-ceed",
  );
  const next = printedToken
    ? moveCards(session, [printedToken.key], "order")
    : setRuleToken(session, "xceed", true);
  if (!hasRuleToken({ session: next, entries }, "xceed")) return session;
  return {
    ...next,
    log: [
      ...next.log.slice(-39),
      `Inno Progrett · revealed ${entries.get(reveal.entryId)?.card?.name} from ride deck; gained X-ceed.`,
    ],
  };
}

/** Observe arrivals, not damage count: healing or turning a damage card over
 * must not retrigger X-ceed. A batch of arrivals creates ordered choices. */
export function damageChoices(
  before: TableSession,
  context: RuleContext,
): RuleState["pending"] {
  const { session, entries } = context;
  if (session.active !== "opponent" || !supportsImpauldio(context) || !hasRuleToken(context, "xceed")) return [];
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
