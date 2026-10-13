import { changeEnergy, moveCards, type TableSession } from "../playtest.ts";
import { crestViews } from "../crests.ts";
import { normalRide } from "./rides.ts";
import { setRuleToken } from "./tokens.ts";
import { hasRuleToken, type RuleContext } from "./types.ts";
import { energyLimit } from "./wirbel.ts";

/** Energy Generator: official BCS2425/VGS04. Placement and the beginning of
 * ride phase are separate timings, so a second player's first ride charges once. */
export function applyEnergyGenerator(
  before: TableSession,
  context: RuleContext,
): TableSession {
  const { entries } = context;
  let next = context.session;
  const enteredRidePhase = before.active === "you" && next.active === "you" &&
    before.phase === "draw" && next.phase === "ride";
  if (
    enteredRidePhase &&
    hasRuleToken({ session: before, entries }, "energyGenerator")
  ) {
    next = changeEnergy(next, 3, energyLimit({ session: next, entries }));
  }
  const ride = normalRide(before, next, entries);
  if (!ride || hasRuleToken({ session: next, entries }, "energyGenerator")) return next;
  const generator = crestViews({ session: next, entries }).find(
    (crest) => crest.energyGenerator,
  );
  if (!generator) return next;
  if (generator.card) {
    // Reserve holds the auxiliary ride-deck crest until it is gained. A crest
    // manually moved elsewhere or turned face down is not a fresh placement.
    const generatorCard = generator.card;
    if (!next.zones.reserve.some((card) => card.key === generatorCard.key)) {
      return next;
    }
    next = moveCards(next, [generatorCard.key], "crest");
  } else {
    // A virtual generator covers lists without artwork/card records. The first
    // ride over grade 0 activates it; later manual removal stays a correction.
    if (entries.get(ride.previous.entryId)?.card?.grade !== 0) return next;
    next = setRuleToken(next, "energyGenerator", true);
  }
  if (!hasRuleToken({ session: next, entries }, "energyGenerator")) return next;
  if (!next.first) {
    next = changeEnergy(next, 3, energyLimit({ session: next, entries }));
  }
  return next;
}
