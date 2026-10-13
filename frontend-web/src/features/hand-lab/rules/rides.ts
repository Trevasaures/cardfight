import type { DeckCardEntry } from "../../../types/api.ts";
import type { TableSession } from "../playtest.ts";

/** Observe a normal ride, never a call, stride, or soul card being uncovered. */
export function normalRide(
  before: TableSession,
  after: TableSession,
  entries: ReadonlyMap<number, DeckCardEntry>,
) {
  const previous = before.zones.vanguard[0];
  const current = after.zones.vanguard[0];
  if (
    before.active !== "you" || after.active !== "you" ||
    before.phase !== "ride" || after.phase !== "ride" ||
    !previous || !current || previous.key === current.key ||
    previous.faceDown || current.faceDown ||
    previous.gUnit || current.gUnit || current.crest ||
    !after.zones.soul.some((card) => card.key === previous.key) ||
    ![...before.zones.hand, ...before.zones.ride].some(
      (card) => card.key === current.key,
    )
  ) return null;
  const previousCard = entries.get(previous.entryId)?.card;
  const currentCard = entries.get(current.entryId)?.card;
  if (
    previousCard?.grade == null || currentCard?.grade == null ||
    !/^(normal|trigger)\s+unit$/i.test(previousCard.card_type?.trim() ?? "") ||
    !/^(normal|trigger)\s+unit$/i.test(currentCard.card_type?.trim() ?? "")
  ) return null;
  return { previous, current };
}
