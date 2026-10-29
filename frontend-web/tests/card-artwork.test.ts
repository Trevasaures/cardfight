import assert from "node:assert/strict";
import test from "node:test";
import {
  artworkFromPrinting,
  artworkPayload,
  resolveCardArtwork,
} from "../src/components/cards/cardArtworkState.ts";
import type { Card, CardPrinting } from "../src/types/api.ts";

function printing(id: number, imageId: string | null): CardPrinting {
  return {
    id,
    card_id: 1,
    set_code: "DZ-BT01",
    set_name: "Fated Clash",
    card_number: `DZ-BT01/${id}`,
    rarity: id === 1 ? "RRR" : "SR",
    image_id: imageId,
    image_url: imageId ? `/api/card-images/${imageId}/full` : null,
    thumbnail_url: imageId ? `/api/card-images/${imageId}/thumbnail` : null,
    product_url: null,
    source: "manual",
    external_id: null,
    created_at: null,
    updated_at: null,
  };
}

const regular = printing(1, "regular");
const alternate = printing(2, "alternate");
const noArt = printing(3, null);
const card = {
  id: 1,
  name: "Test Vanguard",
  primary_printing: regular,
  printings: [regular, alternate, noArt],
} as Card;

test("each selected printing uses its own full artwork and thumbnail", () => {
  for (const selected of [regular, alternate]) {
    const artwork = resolveCardArtwork(card, selected);
    assert.equal(artwork?.image_url, selected.image_url);
    assert.equal(artwork?.thumbnail_url, selected.thumbnail_url);
    assert.equal(artwork?.id, selected.image_id);
  }
  assert.notEqual(
    resolveCardArtwork(card, regular)?.image_url,
    resolveCardArtwork(card, alternate)?.image_url,
  );
});

test("a selected printing without artwork never borrows another printing's image", () => {
  assert.equal(resolveCardArtwork(card, noArt), null);
  assert.equal(artworkFromPrinting(noArt), null);
  // Removing an alternate's image leaves the primary image available to the catalog.
  const removed = {
    ...alternate,
    image_id: null,
    image_url: null,
    thumbnail_url: null,
  };
  assert.equal(resolveCardArtwork(card, removed), null);
  assert.equal(resolveCardArtwork(card)?.id, "regular");
});

test("catalog views may find artwork when their primary printing has no image", () => {
  const missingPrimary = {
    ...card,
    primary_printing: noArt,
    printings: [noArt, alternate],
  };
  assert.equal(resolveCardArtwork(missingPrimary)?.id, "alternate");
  assert.equal(resolveCardArtwork(missingPrimary, null)?.id, "alternate");
  assert.equal(resolveCardArtwork(missingPrimary, noArt), null);
  assert.equal(
    resolveCardArtwork({ ...card, primary_printing: null, printings: [] }),
    null,
  );
});

test("legacy printing URLs remain usable without a stored image or thumbnail", () => {
  const legacy = {
    ...alternate,
    image_id: null,
    image_url: "https://example.com/alternate.jpg",
    thumbnail_url: null,
  };
  const artwork = resolveCardArtwork(card, legacy);
  assert.equal(artwork?.image_url, legacy.image_url);
  assert.equal(artwork?.thumbnail_url, legacy.image_url);
  assert.deepEqual(artworkPayload(artwork), {
    image_id: null,
    image_url: legacy.image_url,
  });
});

test("stored-image replacement and removal clear legacy URL fallbacks", () => {
  assert.deepEqual(artworkPayload(artworkFromPrinting(alternate)), {
    image_id: "alternate",
    image_url: null,
  });
  assert.deepEqual(artworkPayload(null), { image_id: null, image_url: null });
  assert.equal(resolveCardArtwork(card, regular)?.id, "regular");
});
