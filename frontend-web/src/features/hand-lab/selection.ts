import {
  CIRCLES,
  findCard,
  type TableCard,
  type TableSession,
  type Zone,
} from "./playtest.ts";

/** Selection order also determines which physical card's details are shown. */
export function toggleSelection(
  keys: readonly string[],
  key: string,
): string[] {
  return keys.includes(key)
    ? keys.filter((selected) => selected !== key)
    : [...keys, key];
}

/** A direct card action focuses its target without discarding the selected group. */
export function focusSelection(keys: readonly string[], key: string): string[] {
  return [...keys.filter((selected) => selected !== key), key];
}

export function resolveSelection(
  session: TableSession | null,
  keys: readonly string[],
) {
  if (!session) return [];
  return keys.flatMap((key) => {
    const found = findCard(session, key);
    return found ? [found] : [];
  });
}

/** The second click belongs to the rest shortcut, rather than another toggle. */
export function isSelectionClick(
  clickCount: number,
  canRest: boolean,
): boolean {
  return !canRest || clickCount < 2;
}

/** Pile labels browse; exposed artwork and occupied circles select their card. */
export function zoneCardTarget(
  zone: Zone,
  top: TableCard | undefined,
  artworkClicked: boolean,
): TableCard | undefined {
  if (!top || zone === "deck" || zone === "ride") return undefined;
  return CIRCLES.includes(zone) || artworkClicked ? top : undefined;
}
