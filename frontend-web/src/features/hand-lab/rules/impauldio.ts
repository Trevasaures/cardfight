import {
  canDropCards, changePower, moveCards, type TableCard, type TableSession,
} from "../playtest.ts";
import { isCrestEntry } from "../crests.ts";
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

/** Only playable physical drop copies can pay the mandatory gauge choice. */
export function canResolveXceed(context: RuleContext, key: string | null): boolean {
  const { session } = context;
  if (session.phase === "mulligan" || session.rules.pending[0]?.rule !== "xceed") {
    return false;
  }
  const eligible = (card: TableCard) => !card.ticket && !card.crest &&
    !isCrestEntry(context.entries.get(card.entryId)) &&
    canDropCards(session, [card.key], "gauge");
  return key === null
    ? !session.zones.drop.some(eligible)
    : session.zones.drop.some((card) => card.key === key && eligible(card));
}

/** Preview the queued ability using the count AFTER its optional gauge move.
 * This also handles an empty drop: resolving the power does not require a card. */
export function xceedPowerBonus(
  context: RuleContext,
  addingGauge: boolean,
): 0 | 5000 {
  const pending = context.session.rules.pending[0];
  if (pending?.rule !== "xceed") return 0;
  return context.session.zones.gauge.length + Number(addingGauge) >= 4 ||
    pending.nonTriggerDamageCheck ? 5000 : 0;
}

/** Resolve exactly one queued ability, with gauge movement and power in one
 * snapshot. Trigger power and other trigger effects remain the player's choice. */
export function resolveXceed(
  context: RuleContext,
  key: string | null,
): TableSession {
  const { session } = context;
  if (!canResolveXceed(context, key)) return session;

  let next = key === null ? session : moveCards(session, [key], "gauge");
  // Never consume the pending ability if a movement guard rejects its card.
  if (
    key !== null &&
    (next === session || !next.zones.gauge.some((card) => card.key === key))
  ) {
    return session;
  }
  const bonus = xceedPowerBonus(context, key !== null);
  const vanguard = next.zones.vanguard[0];
  const powered = bonus && vanguard ? changePower(next, [vanguard.key], bonus) : next;
  const power = powered !== next
    ? "Vanguard +5,000 until end of turn"
    : "no X-ceed power";
  next = powered;
  const message = `X-ceed · ${key ? "AutoMOD +1" : "no eligible drop card"} · ${power}.`;
  return {
    ...next,
    rules: { ...next.rules, pending: next.rules.pending.slice(1) },
    log: [...next.log.slice(-39), message],
  };
}
