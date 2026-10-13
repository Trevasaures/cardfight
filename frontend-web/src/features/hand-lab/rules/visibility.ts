import { hasRitualDeck } from "./luard.ts";
import { cardName, type RuleContext } from "./types.ts";

/** Deck identities drive the UI; unrelated saved tokens never expose mechanics. */
export function supportsImpauldio(context: RuleContext): boolean {
  return [...context.entries.values()].some((entry) => {
    const name = cardName(entry.card?.name);
    return /\bimpauldio\b/.test(name)
      || name === "inno progrett"
      || name.replace(/\s/g, "") === "systemcode:x-ceed";
  });
}

export function ruleVisibility(context: RuleContext) {
  return {
    ritual: hasRitualDeck(context),
    impauldio: supportsImpauldio(context),
    // Keep an already queued decision resolvable in a legacy snapshot, even
    // if that game's old deck entries no longer identify the same ride line.
    pendingXceed: context.session.rules.pending.length > 0,
  };
}
