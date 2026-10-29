import assert from "node:assert/strict";
import test from "node:test";
import type { Card, CardPrinting } from "../src/types/api.ts";
import {
  printingFormPayload,
  hasPrintingDraftChanges,
  printingToForm,
  withSavedPrinting,
} from "../src/components/cards/cardPrintingFormState.ts";

const primary = {
  id: 11,
  card_id: 1,
  set_code: "DZ-BT01",
  set_name: "Fated Clash",
  card_number: "001",
  rarity: "RRR",
  image_id: "primary-image",
  image_url: "/primary/full",
  thumbnail_url: "/primary/thumb",
} as CardPrinting;
const alternate = {
  ...primary,
  id: 12,
  rarity: "SP",
  image_id: "alternate-image",
  image_url: "/alternate/full",
  thumbnail_url: "/alternate/thumb",
};
const card = {
  id: 1,
  name: "Shared unit",
  skill_text: "Shared ability",
  primary_printing: primary,
  printings: [primary, alternate],
} as Card;

test("old combined drafts retain printing edits without treating shared edits as artwork changes", () => {
  const unchanged = printingToForm(primary);
  const sharedEdit = { ...unchanged, name: "Renamed card", skill_text: "Draw two cards." };
  assert.equal(hasPrintingDraftChanges(card, unchanged), false);
  assert.equal(hasPrintingDraftChanges(card, sharedEdit), false);
  assert.equal(hasPrintingDraftChanges(card, { ...unchanged, rarity: "SEC" }), true);
  assert.equal(hasPrintingDraftChanges(card, { ...unchanged, artwork: null }), true);
  assert.equal(hasPrintingDraftChanges(card, {
    ...unchanged,
    artwork: { id: "replacement", image_url: "/replacement", thumbnail_url: "/replacement" },
  }), true);
});

test("the editor loads the chosen printing's metadata and image", () => {
  const draft = printingToForm(alternate);
  assert.equal(draft.rarity, "SP");
  assert.deepEqual(draft.artwork, {
    id: "alternate-image",
    image_url: "/alternate/full",
    thumbnail_url: "/alternate/thumb",
  });
  assert.deepEqual(printingFormPayload(draft), {
    set_code: "DZ-BT01",
    set_name: "Fated Clash",
    card_number: "001",
    rarity: "SP",
    image_id: "alternate-image",
    image_url: null,
  });
});

test("removing alternate artwork clears both references without borrowing the primary", () => {
  const draft = { ...printingToForm(alternate), artwork: null };
  const payload = printingFormPayload(draft);
  assert.equal(payload.image_id, null);
  assert.equal(payload.image_url, null);
  assert.equal(
    printingToForm({ ...alternate, image_id: null, image_url: null }).artwork,
    null,
  );
  assert.equal(primary.image_id, "primary-image");
});

test("a printing save updates only that variant in the inspector snapshot", () => {
  const saved = { ...alternate, image_id: "replacement" };
  const updated = withSavedPrinting(card, saved);
  assert.equal(updated.primary_printing, primary);
  assert.deepEqual(updated.printings, [primary, saved]);
  assert.equal(updated.skill_text, "Shared ability");
  assert.deepEqual(card.printings, [primary, alternate]);
});

test("primary edits and new variants keep the inspector's default printing consistent", () => {
  const savedPrimary = { ...primary, image_id: "replacement" };
  assert.equal(
    withSavedPrinting(card, savedPrimary).primary_printing,
    savedPrimary,
  );
  const newPrinting = { ...alternate, id: 13, rarity: "SEC" };
  const updated = withSavedPrinting(card, newPrinting);
  assert.deepEqual(updated.printings, [primary, alternate, newPrinting]);
  assert.equal(updated.primary_printing, primary);
  assert.equal(
    withSavedPrinting(
      { ...card, primary_printing: null, printings: [] },
      primary,
    ).primary_printing,
    primary,
  );
});
