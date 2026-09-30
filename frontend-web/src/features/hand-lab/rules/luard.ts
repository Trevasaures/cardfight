import type { TableCard, Zone } from "../playtest.ts";
import { cardName, type RuleContext } from "./types.ts";

/** Version-aware modifiers never rewrite the catalog's printed grade. */
export function effectiveGrade(
  context: RuleContext,
  copy: TableCard,
  zone: Zone,
): number | null {
  const entry = context.entries.get(copy.entryId);
  const grade = entry?.card?.grade ?? null;
  if (
    zone !== "drop" || grade === null ||
    cardName(entry?.card?.name) !== "dragwizard, morfessa"
  ) return grade;

  const printing = entry?.printing ?? entry?.card?.primary_printing;
  const set = (
    printing?.set_code ?? printing?.card_number?.split("/")[0] ?? ""
  ).toUpperCase();
  // The Standard printing is unconditional. The original G printing needs GB1.
  // Unknown printings stay manual rather than borrowing a namesake's ability.
  if (set === "D-SS10") return grade - 1;
  if (set === "G-BT09") {
    const generationBreak =
      context.session.zones.g.some((card) => !card.faceDown) ||
      context.session.zones.vanguard.some((card) =>
        !card.faceDown && context.entries.get(card.entryId)?.zone === "g",
      );
    if (generationBreak) return grade - 1;
  }
  return grade;
}

export function ritualCount(context: RuleContext): number {
  return context.session.zones.drop.filter(
    (card) => effectiveGrade(context, card, "drop") === 1,
  ).length;
}

export function hasRitualDeck(context: RuleContext): boolean {
  return [...context.entries.values()].some((entry) =>
    /luard|morfessa/.test(cardName(entry.card?.name)) ||
    /\britual\s+\d/i.test(entry.card?.skill_text ?? ""),
  );
}
