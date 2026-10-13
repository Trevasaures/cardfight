import {
  changeCards,
  findCard,
  moveCards,
  type TableSession,
} from "./playtest.ts";
import { setRuleToken } from "./rules/index.ts";
import type { RuleContext } from "./rules/types.ts";
import { isCrestEntry, isEnergyGenerator, type CrestView } from "./crests.ts";

/** Manual corrections share the physical/virtual source used by automatic rules. */
export function toggleCrest(
  context: RuleContext,
  view: CrestView,
): TableSession {
  const { session } = context;
  if (session.phase === "mulligan") return session;
  if (view.virtual)
    return setRuleToken(session, "energyGenerator", !view.active);
  const found = view.card && findCard(session, view.card.key);
  if (!found) return session;
  const entry = context.entries.get(found.card.entryId);
  const legacyGenerator = (found.zone === "crest" || found.zone === "reserve") &&
    isEnergyGenerator(entry);
  if (
    !found.card.crest && !isCrestEntry(entry) && !legacyGenerator
  ) {
    return session;
  }
  let next = moveCards(
    session,
    [found.card.key],
    view.active ? "reserve" : "crest",
  );
  if (!view.active && found.zone === "crest" && found.card.faceDown) {
    next = changeCards(next, [found.card.key], "flip");
  }
  if (view.energyGenerator && next.rules.tokens.energyGenerator) {
    // Once a real card is operated, face-up presence becomes its sole source.
    next = setRuleToken(next, "energyGenerator", false);
  }
  return next;
}
