import assert from "node:assert/strict";
import test from "node:test";
import {
  dealHand,
  discardCards,
  drawCard,
  mainDeckCopies,
  mulligan,
  seededRandom,
  shuffle,
  type CardCopy,
} from "../src/features/hand-lab/engine.ts";
import type { DeckCardEntry } from "../src/types/api.ts";

const cards: CardCopy[] = Array.from({ length: 50 }, (_, index) => ({
  key: `copy-${index}`,
  cardId: index < 4 ? 1 : 2,
  entryId: index,
}));
function inventory(session: ReturnType<typeof dealHand>) {
  return [...session.hand, ...session.deck, ...session.discard]
    .map((card) => card.key)
    .sort();
}

test("only main-deck copies enter the draw pool; printing rows stay distinct", () => {
  const entries = [
    { id: 10, card_id: 1, quantity: 3, zone: "main", card: { id: 1 } },
    { id: 11, card_id: 1, quantity: 1, zone: "main", card: { id: 1 } },
    { id: 12, card_id: 3, quantity: 1, zone: "ride", card: { id: 3 } },
    { id: 13, card_id: 4, quantity: 16, zone: "g", card: { id: 4 } },
    { id: 14, card_id: 5, quantity: 2, zone: "token", card: { id: 5 } },
  ] as DeckCardEntry[];
  const copies = mainDeckCopies(entries);
  assert.equal(copies.length, 4);
  assert.equal(new Set(copies.map((card) => card.key)).size, 4);
  assert.ok(copies.every((card) => card.cardId === 1));
  assert.throws(
    () => mainDeckCopies([{ ...entries[0], card: null }]),
    /unavailable/,
  );
});

test("deal creates five cards without mutating the saved list", () => {
  const before = [...cards];
  const session = dealHand(cards, seededRandom(5));
  assert.equal(session.hand.length, 5);
  assert.equal(session.deck.length, 45);
  assert.deepEqual(cards, before);
  assert.deepEqual(inventory(session), cards.map((card) => card.key).sort());
  assert.throws(() => dealHand(cards.slice(0, 4)), /at least five/);
});

test("mulligan draws replacements before returning physical copies to the shuffled deck", () => {
  const opening = dealHand(cards, seededRandom(8));
  const selected = [opening.hand[0].key, opening.hand[3].key];
  const result = mulligan(opening, selected, seededRandom(9));
  assert.deepEqual(result.hand.slice(-2), opening.deck.slice(0, 2));
  assert.ok(result.hand.every((card) => !selected.includes(card.key)));
  assert.equal(result.hand.length, 5);
  assert.equal(result.deck.length, 45);
  assert.deepEqual(inventory(result), inventory(opening));
  assert.equal(
    mulligan(result, [result.hand[0].key]),
    result,
    "only one mulligan is allowed",
  );
});

test("keeping all five does not shuffle and draw is blocked until the mulligan is resolved", () => {
  const opening = dealHand(cards, seededRandom(10));
  assert.equal(drawCard(opening), opening);
  assert.equal(discardCards(opening, [opening.hand[0].key]), opening);
  const kept = mulligan(opening, [], () => {
    throw new Error("must not shuffle");
  });
  assert.deepEqual(kept.hand, opening.hand);
  assert.deepEqual(kept.deck, opening.deck);
  assert.equal(kept.phase, "practice");
});

test("draws and discards conserve copies, even when the deck is exhausted", () => {
  let session = mulligan(dealHand(cards, seededRandom(12)), []);
  const keys = [session.hand[0].key, session.hand[1].key];
  session = discardCards(session, [...keys, keys[0], "unknown"]);
  assert.equal(session.hand.length, 3);
  assert.equal(session.discard.length, 2);
  for (let index = 0; index < 50; index++) session = drawCard(session);
  assert.equal(session.draws, 45);
  assert.equal(session.deck.length, 0);
  assert.equal(session.hand.length, 48);
  assert.deepEqual(inventory(session), cards.map((card) => card.key).sort());
});

test("shuffle is reproducible and leaves its input intact", () => {
  assert.deepEqual(
    shuffle(cards, seededRandom(33)),
    shuffle(cards, seededRandom(33)),
  );
  assert.notDeepEqual(
    shuffle(cards, seededRandom(33)),
    shuffle(cards, seededRandom(34)),
  );
});

test("a five-card practice list can resolve a full redraw without losing copies", () => {
  const opening = dealHand(cards.slice(0, 5), seededRandom(5));
  const result = mulligan(
    opening,
    opening.hand.map((card) => card.key),
    seededRandom(6),
  );
  assert.equal(result.hand.length, 5);
  assert.equal(result.deck.length, 0);
  assert.deepEqual(inventory(result), inventory(opening));
  assert.equal(drawCard(result), result);
});
