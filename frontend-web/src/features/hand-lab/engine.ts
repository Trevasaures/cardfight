import type { DeckCardEntry } from "../../types/api.ts";

// The key identifies one physical copy, even when several copies share a card ID.
export type CardCopy = { key: string; cardId: number; entryId: number };
export type Random = () => number;
export type HandSession = {
  hand: CardCopy[];
  deck: CardCopy[];
  discard: CardCopy[];
  phase: "mulligan" | "practice";
  draws: number;
};

export function mainDeckCopies(entries: readonly DeckCardEntry[]): CardCopy[] {
  return entries
    .filter((entry) => entry.zone === "main")
    .flatMap((entry) => {
      if (
        !entry.card ||
        !Number.isInteger(entry.quantity) ||
        entry.quantity < 1
      ) {
        throw new Error(
          "This list has an unavailable card or invalid quantity. Update it in Deck Builder.",
        );
      }
      return Array.from({ length: entry.quantity }, (_, index) => ({
        key: `${entry.id}:${index}`,
        cardId: entry.card_id,
        entryId: entry.id,
      }));
    });
}

export function shuffle<T>(
  cards: readonly T[],
  random: Random = Math.random,
): T[] {
  // Fisher–Yates on a copy preserves the previous deck order for undo.
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

export function dealHand(
  cards: readonly CardCopy[],
  random: Random = Math.random,
): HandSession {
  if (cards.length < 5)
    throw new Error("Add at least five main-deck cards to deal a hand.");
  const deck = shuffle(cards, random);
  return {
    hand: deck.slice(0, 5),
    deck: deck.slice(5),
    discard: [],
    phase: "mulligan",
    draws: 0,
  };
}

export function mulligan(
  session: HandSession,
  selected: readonly string[],
  random: Random = Math.random,
): HandSession {
  if (session.phase !== "mulligan") return session;
  const selectedKeys = new Set(selected);
  const returned = session.hand.filter((card) => selectedKeys.has(card.key));
  const kept = session.hand.filter((card) => !selectedKeys.has(card.key));
  // Vanguard setup: bottom returned cards, draw replacements, then shuffle.
  // Shuffling first would allow the same physical copies to be redrawn.
  const deck = [...session.deck, ...returned];
  return {
    ...session,
    hand: [...kept, ...deck.slice(0, returned.length)],
    deck: returned.length ? shuffle(deck.slice(returned.length), random) : deck,
    phase: "practice",
  };
}

export function drawCard(session: HandSession): HandSession {
  if (session.phase !== "practice" || !session.deck.length) return session;
  return {
    ...session,
    hand: [...session.hand, session.deck[0]],
    deck: session.deck.slice(1),
    draws: session.draws + 1,
  };
}

export function discardCards(
  session: HandSession,
  selected: readonly string[],
): HandSession {
  if (session.phase !== "practice") return session;
  const selectedKeys = new Set(selected);
  return {
    ...session,
    hand: session.hand.filter((card) => !selectedKeys.has(card.key)),
    discard: [
      ...session.discard,
      ...session.hand.filter((card) => selectedKeys.has(card.key)),
    ],
  };
}

export function seededRandom(seed: number): Random {
  // Deterministic randomness lets tests replay the same deals and shuffles.
  // The unsigned conversion keeps each generated value in [0, 1).
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
