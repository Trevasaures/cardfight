import type { DeckCardEntry } from "../../../types/api.ts";
import type { TableSession } from "../playtest.ts";

export type RuleContext = {
  session: TableSession;
  entries: ReadonlyMap<number, DeckCardEntry>;
};

export type RuleToken = "energyGenerator" | "xceed";

/** Only mutable choices belong in snapshots; counts and conditions are derived. */
export type RuleState = {
  tokens: Record<RuleToken, boolean>;
  pending: { rule: "xceed"; nonTriggerDamageCheck: boolean }[];
};

export function emptyRules(): RuleState {
  return { tokens: { energyGenerator: false, xceed: false }, pending: [] };
}

export function cardName(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Printed tokens also work; virtual tokens cover lists without token records. */
export function hasRuleToken(context: RuleContext, token: RuleToken): boolean {
  if (context.session.rules.tokens[token]) return true;
  const zone = token === "energyGenerator" ? "crest" : "order";
  const expected = token === "energyGenerator"
    ? "energygenerator" : "systemcode:x-ceed";
  return context.session.zones[zone].some((copy) => {
    const name = cardName(context.entries.get(copy.entryId)?.card?.name);
    return !copy.faceDown && name.replace(/\s/g, "") === expected;
  });
}
