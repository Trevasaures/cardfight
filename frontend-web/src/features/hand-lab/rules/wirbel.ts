import { cardName, hasRuleToken, type RuleContext } from "./types.ts";

// DZ-BT15/001: the extension belongs to Kenig on VC, not every Wirbel card.
export function energyLimit(context: RuleContext): number {
  const vanguard = context.session.zones.vanguard[0];
  const name =
    vanguard && cardName(context.entries.get(vanguard.entryId)?.card?.name);
  const extended =
    vanguard && !vanguard.faceDown &&
    name === "hellfire dragon emperor, wirbel kenig" &&
    hasRuleToken(context, "energyGenerator");
  return extended ? 15 : 10;
}
