import type { DeckCardEntry } from "../../types/api.ts";
import { isCrestCard } from "../../utils/cards.ts";
import type { TableCard, Zone } from "./playtest.ts";
import { cardName, hasRuleToken, type RuleContext } from "./rules/types.ts";

export const CREST_DESTINATIONS: readonly Zone[] = ["crest", "reserve"];

/** Recognize legacy type-marked entries as well as the explicit deck section. */
export function isCrestEntry(entry: DeckCardEntry | undefined): boolean {
  return Boolean(entry && (entry.zone === "crest" || isCrestCard(entry.card)));
}

export function isEnergyGenerator(entry: DeckCardEntry | undefined): boolean {
  return cardName(entry?.card?.name).replace(/\s/g, "") === "energygenerator";
}

export type CrestView = {
  key: string;
  card?: TableCard;
  entry?: DeckCardEntry;
  active: boolean;
  energyGenerator: boolean;
  virtual: boolean;
};

/** A virtual crest is a view of the rule token, never a playable inventory copy. */
export function crestViews({ session, entries }: RuleContext): CrestView[] {
  const physical: CrestView[] = (
    Object.entries(session.zones) as [Zone, TableCard[]][]
  ).flatMap(([zone, copies]) =>
    copies.flatMap((card) => {
      const entry = entries.get(card.entryId);
      // Old sessions could place a type-less generator directly in Crest.
      // Keep that physical card operable without reclassifying the whole deck.
      const legacyGenerator = (zone === "crest" || zone === "reserve") &&
        isEnergyGenerator(entry);
      if (!card.crest && !isCrestEntry(entry) && !legacyGenerator) return [];
      return [
        {
          key: card.key,
          card,
          entry,
          active: zone === "crest" && !card.faceDown,
          energyGenerator: isEnergyGenerator(entry),
          virtual: false,
        },
      ];
    }),
  );
  const generator = physical.find((view) => view.energyGenerator);
  if (generator) {
    // Older games could enable the virtual token while also owning its card.
    // Reflect that flag on one tile without adding a second physical copy.
    generator.active ||= session.rules.tokens.energyGenerator;
  } else {
    physical.unshift({
      key: "virtual:energyGenerator",
      active: hasRuleToken({ session, entries }, "energyGenerator"),
      energyGenerator: true,
      virtual: true,
    });
  }
  return physical.sort(
    (a, b) => Number(b.energyGenerator) - Number(a.energyGenerator),
  );
}
