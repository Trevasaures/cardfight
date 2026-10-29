import assert from "node:assert/strict";
import test from "node:test";
import type { Card, CardPrinting, DeckVersion } from "../src/types/api.ts";
import { resolveCardArtwork } from "../src/components/cards/cardArtworkState.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  findCard,
  finishMulligan,
  listCopies,
  moveCards,
  startTable,
  type TableSession,
} from "../src/features/hand-lab/playtest.ts";
import {
  createPlaytestStore,
  PLAYTEST_STORAGE_KEY,
  playtestSource,
  type PlaytestState,
} from "../src/features/hand-lab/sessionStore.ts";

const primary = {
  id: 101,
  card_id: 1,
  set_code: "DZ-BT01",
  rarity: "RRR",
  image_id: "primary-image",
  image_url: "/api/card-images/primary-image/full",
  thumbnail_url: "/api/card-images/primary-image/thumbnail",
} as CardPrinting;
const alternate = {
  ...primary,
  id: 102,
  rarity: "SR",
  image_id: "alternate-image",
  image_url: "/api/card-images/alternate-image/full",
  thumbnail_url: "/api/card-images/alternate-image/thumbnail",
} as CardPrinting;
const card = {
  id: 1,
  name: "Artwork test unit",
  grade: 1,
  card_type: "Normal Unit",
  primary_printing: primary,
  printings: [primary, alternate],
} as Card;
const version = {
  id: 7,
  deck_id: 3,
  cards: [primary, alternate].map((printing, index) => ({
    id: 10 + index,
    card_id: card.id,
    printing_id: printing.id,
    printing,
    card,
    quantity: 3,
    zone: "main",
  })),
} as DeckVersion;

function storageFixture() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function activeGame(): PlaytestState {
  const before = finishMulligan(
    startTable(version.cards, true, null, seededRandom(17)),
    [],
  );
  return {
    starterKey: null,
    history: {
      past: [before],
      present: moveCards(before, ["11:0"], "frontLeft"),
    },
  };
}

function artworkFor(
  session: TableSession,
  key: string,
  currentVersion = version,
) {
  const copy = findCard(session, key)!.card;
  const entry = currentVersion.cards.find((item) => item.id === copy.entryId)!;
  return resolveCardArtwork(entry.card!, entry.printing);
}

test("different printings of one card retain their artwork through recovery and Undo", () => {
  const storage = storageFixture();
  const game = activeGame();
  assert.equal(game.history.present!.zones.frontLeft[0].key, "11:0");
  createPlaytestStore(() => storage).save(playtestSource(version), game);

  const recovered = createPlaytestStore(() => storage).restore(
    playtestSource(version),
    listCopies(version.cards),
  ).state!;
  assert.deepEqual(recovered, game);
  assert.equal(artworkFor(recovered.history.present!, "10:0")?.id, primary.image_id);
  assert.equal(artworkFor(recovered.history.present!, "11:0")?.id, alternate.image_id);

  const undone = {
    ...recovered,
    history: { past: [], present: recovered.history.past.at(-1)! },
  };
  createPlaytestStore(() => storage).save(playtestSource(version), undone);
  const resumedUndo = createPlaytestStore(() => storage).restore(
    playtestSource(version),
    listCopies(version.cards),
  ).state!;
  assert.equal(findCard(resumedUndo.history.present!, "11:0")!.zone, "hand");
  assert.equal(artworkFor(resumedUndo.history.present!, "11:0")?.id, alternate.image_id);
});

test("replacing artwork refreshes the selected printing without resetting the table", () => {
  const storage = storageFixture();
  const game = activeGame();
  createPlaytestStore(() => storage).save(playtestSource(version), game);
  const replacement = {
    ...alternate,
    image_id: "replacement-image",
    image_url: "/api/card-images/replacement-image/full",
    thumbnail_url: "/api/card-images/replacement-image/thumbnail",
  };
  const updated = {
    ...version,
    cards: version.cards.map((entry) =>
      entry.printing_id === alternate.id
        ? { ...entry, printing: replacement }
        : entry,
    ),
  };
  const recovered = createPlaytestStore(() => storage).restore(
    playtestSource(updated),
    listCopies(updated.cards),
  ).state!;

  assert.deepEqual(recovered, game);
  assert.equal(artworkFor(recovered.history.present!, "10:0", updated)?.id, primary.image_id);
  assert.equal(artworkFor(recovered.history.present!, "11:0", updated)?.id, replacement.image_id);
  assert.equal(artworkFor(recovered.history.past[0], "11:0", updated)?.id, replacement.image_id);
  assert.equal(
    storage.getItem(PLAYTEST_STORAGE_KEY)!.includes("/api/card-images/"),
    false,
    "game backups retain physical-copy references rather than stale artwork URLs",
  );
});

test("removing alternate artwork does not borrow the primary image after recovery", () => {
  const storage = storageFixture();
  const game = activeGame();
  createPlaytestStore(() => storage).save(playtestSource(version), game);
  const updated = {
    ...version,
    cards: version.cards.map((entry) =>
      entry.printing_id === alternate.id
        ? {
            ...entry,
            printing: {
              ...alternate,
              image_id: null,
              image_url: null,
              thumbnail_url: null,
            },
          }
        : entry,
    ),
  };
  const recovered = createPlaytestStore(() => storage).restore(
    playtestSource(updated),
    listCopies(updated.cards),
  ).state!;

  assert.deepEqual(recovered, game);
  assert.equal(artworkFor(recovered.history.present!, "10:0", updated)?.id, primary.image_id);
  assert.equal(artworkFor(recovered.history.present!, "11:0", updated), null);
  assert.equal(artworkFor(recovered.history.past[0], "11:0", updated), null);
});
