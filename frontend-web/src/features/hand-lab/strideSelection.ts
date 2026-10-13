import { resolveSelection } from "./selection.ts";
import { isGUnit } from "./stride.ts";
import type { RuleContext } from "./rules/types.ts";
import type { TableCard } from "./playtest.ts";

/** Stride targets one G unit. Selecting its current vanguard as well is harmless;
 * other groups still need an explicit single-card choice before changing a circle. */
export function selectedStrideTarget(
  context: RuleContext,
  keys: readonly string[],
): TableCard | undefined {
  const selection = resolveSelection(context.session, keys);
  const candidates = selection.filter(
    ({ card, zone }) =>
      zone === "g" && isGUnit(card, context.entries.get(card.entryId)),
  );
  if (candidates.length !== 1) return undefined;
  const chosen = candidates[0].card;
  const onlyChosenAndVanguard = selection.every(
    ({ card, zone }) => card.key === chosen.key || zone === "vanguard",
  );
  return onlyChosenAndVanguard ? chosen : undefined;
}
