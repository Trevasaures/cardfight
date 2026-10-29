import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_MANUAL_CARD_FORM,
  manualCardFormIsComplete,
  sharedCardFormIsComplete,
} from "../src/components/deck-builder/manualCardFormState.ts";

const sharedDetails = {
  ...EMPTY_MANUAL_CARD_FORM,
  name: "Catalog unit",
  nation: "Lyrical Monasterio",
  card_type: "Normal Unit",
  grade: "0",
};

test("shared card editing does not require printing metadata or artwork", () => {
  assert.equal(sharedCardFormIsComplete(sharedDetails), true);
  assert.equal(manualCardFormIsComplete(sharedDetails), false);
  for (const field of ["name", "nation", "card_type", "grade"] as const) {
    assert.equal(
      sharedCardFormIsComplete({ ...sharedDetails, [field]: "  " }),
      false,
      `${field} is still required for a shared unit edit`,
    );
  }
});

test("grade-less crests can be edited without inventing a grade or printing", () => {
  for (const card_type of ["Crest", "Ride Deck Crest"]) {
    const crest = { ...sharedDetails, card_type, grade: "" };
    assert.equal(sharedCardFormIsComplete(crest), true);
    assert.equal(manualCardFormIsComplete(crest), false);
  }
});

test("new card creation still requires its initial printing metadata", () => {
  const complete = {
    ...sharedDetails,
    set_code: "DZ-BT01",
    set_name: "Fated Clash",
    card_number: "DZ-BT01/001",
    rarity: "RRR",
  };
  assert.equal(manualCardFormIsComplete(complete), true);
  for (const field of ["set_code", "set_name", "card_number", "rarity"] as const) {
    const missingPrintingField = { ...complete, [field]: "  " };
    assert.equal(manualCardFormIsComplete(missingPrintingField), false);
    assert.equal(sharedCardFormIsComplete(missingPrintingField), true);
  }
});
