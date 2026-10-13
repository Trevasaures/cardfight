import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  changeCards,
  finishMulligan,
  moveCards,
  startTable,
  type TableSession,
  type Zone,
} from "../src/features/hand-lab/playtest.ts";
import {
  focusSelection,
  isSelectionClick,
  resolveSelection,
  toggleSelection,
  zoneCardTarget,
} from "../src/features/hand-lab/selection.ts";

const entries = [
  { id: 1, card_id: 1, quantity: 10, zone: "main", card: { grade: 1 } },
  { id: 2, card_id: 2, quantity: 1, zone: "ride", card: { grade: 0 } },
  { id: 3, card_id: 3, quantity: 1, zone: "ride", card: { grade: 1 } },
] as DeckCardEntry[];
const ready = () =>
  finishMulligan(startTable(entries, true, "2:0", seededRandom(5)), []);

function clickZone(
  session: TableSession,
  selected: string[],
  zone: Zone,
  artworkClicked: boolean,
) {
  const cards = session.zones[zone];
  const top = zone === "deck" ? cards[0] : cards.at(-1);
  const target = zoneCardTarget(zone, top, artworkClicked);
  return target ? toggleSelection(selected, target.key) : selected;
}

test("card toggles keep an ordered group and focus only the latest remaining copy", () => {
  const session = ready();
  const [a, b, c] = session.zones.hand;
  let selected: string[] = [];
  for (const card of [a, b, c]) selected = toggleSelection(selected, card.key);
  assert.equal(a.entryId, b.entryId, "copies of one entry are independent");
  assert.equal(resolveSelection(session, selected).at(-1)?.card.key, c.key);

  const previous = selected;
  selected = toggleSelection(selected, b.key);
  assert.deepEqual(
    previous,
    [a.key, b.key, c.key],
    "no previous state mutation",
  );
  assert.deepEqual(selected, [a.key, c.key]);
  assert.equal(resolveSelection(session, selected).at(-1)?.card.key, c.key);
  selected = toggleSelection(selected, c.key);
  assert.equal(resolveSelection(session, selected).at(-1)?.card.key, a.key);
  selected = toggleSelection(selected, a.key);
  assert.equal(resolveSelection(session, selected).at(-1), undefined);

  selected = toggleSelection(toggleSelection([], b.key), a.key);
  assert.equal(resolveSelection(session, selected).at(-1)?.card.key, a.key);
});

test("occupied circles toggle while pile labels and closed deck backs only browse", () => {
  let session = ready();
  const hand = session.zones.hand[0];
  session = moveCards(session, [hand.key], "frontLeft");
  const vanguard = session.zones.vanguard[0];
  const selected = [vanguard.key];

  const both = clickZone(session, selected, "frontLeft", false);
  assert.deepEqual(both, [vanguard.key, hand.key]);
  assert.deepEqual(clickZone(session, both, "frontLeft", true), selected);
  assert.deepEqual(clickZone(session, selected, "vanguard", false), []);
  assert.equal(clickZone(session, selected, "frontRight", true), selected);
  assert.equal(clickZone(session, selected, "deck", true), selected);
  assert.equal(clickZone(session, selected, "ride", true), selected);

  session = moveCards(session, [hand.key], "drop");
  assert.equal(clickZone(session, selected, "drop", false), selected);
  const withDrop = clickZone(session, selected, "drop", true);
  assert.deepEqual(withDrop, [vanguard.key, hand.key]);
  assert.equal(resolveSelection(session, withDrop).at(-1)?.zone, "drop");
  assert.deepEqual(clickZone(session, withDrop, "drop", true), selected);
});

test("group moves retain physical selection order and update the focused card's zone", () => {
  const before = ready();
  const [a, b] = before.zones.hand;
  const selected = [b.key, a.key];
  const after = moveCards(before, selected, "drop");
  assert.deepEqual(
    after.zones.drop.map((card) => card.key),
    selected,
  );
  assert.deepEqual(
    resolveSelection(after, selected).map(({ card, zone }) => [card.key, zone]),
    [
      [b.key, "drop"],
      [a.key, "drop"],
    ],
  );
  assert.equal(resolveSelection(after, selected).at(-1)?.card.key, a.key);
});

test("double-click rests one unit and refocuses it without losing other selected cards", () => {
  let before = ready();
  const [target, other] = before.zones.hand;
  before = moveCards(before, [target.key], "frontLeft");
  before = moveCards(before, [other.key], "frontRight");
  const vanguard = before.zones.vanguard[0];

  for (const targetWasSelected of [false, true]) {
    let selected = [vanguard.key, other.key];
    if (targetWasSelected) selected.push(target.key);
    // Browser event order: first click, second click, then double-click.
    for (const clickCount of [1, 2]) {
      if (isSelectionClick(clickCount, true)) {
        selected = toggleSelection(selected, target.key);
      }
    }
    const after = changeCards(before, [target.key], "rest");
    selected = focusSelection(selected, target.key);
    assert.deepEqual(selected, [vanguard.key, other.key, target.key]);
    assert.equal(resolveSelection(after, selected).at(-1)?.card.rested, true);
    assert.equal(after.zones.frontRight[0].rested, false);
    assert.equal(after.zones.vanguard[0].rested, false);
    assert.equal(before.zones.frontLeft[0].rested, false);

    const stood = changeCards(after, [target.key], "rest");
    assert.equal(resolveSelection(stood, selected).at(-1)?.card.rested, false);
  }
  assert.equal(isSelectionClick(0, true), true, "keyboard activation toggles");
  assert.equal(
    isSelectionClick(2, false),
    true,
    "nonunits have no rest shortcut",
  );
});

test("missing selections cannot leave stale card details after a restored session", () => {
  const session = ready();
  const key = session.zones.hand[0].key;
  assert.equal(
    resolveSelection(session, [key, "missing"]).at(-1)?.card.key,
    key,
  );
  assert.deepEqual(resolveSelection(session, ["missing"]), []);
  assert.deepEqual(resolveSelection(null, [key]), []);
});
