import assert from "node:assert/strict";
import test from "node:test";
import {
  cardGradeBadge,
  cardGradeLabel,
  cardGradeToApiValue,
  isCrestCard,
} from "../src/utils/cards.ts";
import {
  cardToManualForm,
  EMPTY_MANUAL_CARD_FORM,
  manualCardFormIsComplete,
  updateManualCardType,
} from "../src/components/deck-builder/manualCardFormState.ts";
import {
  cardAdditionIssue,
  suggestedDeckCardZone,
} from "../src/components/deck-builder/deckCardSelection.ts";
import type {
  Card,
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
} from "../src/types/api.ts";

const unit = { id: 1, card_type: "Normal Unit", grade: 3 } as Card;
const nightrose = { id: 2, card_type: "Crest", grade: null } as Card;
const energy = { id: 3, card_type: "Ride Deck Crest", grade: null } as Card;
const version = {
  cards: [],
  deck_rules: {
    main_deck_count: 50,
    main_deck_limit: 50,
    ride_deck_count: 4,
    ride_deck_limit: 4,
  },
} as unknown as DeckVersion;
const form = {
  ...EMPTY_MANUAL_CARD_FORM,
  name: "Nightrose Crest",
  nation: "Stoicheia",
  card_type: "Crest",
  set_code: "DZ-SS03",
  set_name: "Stride Deckset",
  card_number: "DZ-SS03/024",
  rarity: "C",
};

test("both official crest types are grade-less and use Crest labels", () => {
  for (const crest of [nightrose, energy]) {
    assert.equal(isCrestCard(crest), true);
    assert.equal(cardGradeBadge(crest), "Crest");
    assert.equal(cardGradeLabel(crest), "Crest");
    assert.equal(
      cardGradeToApiValue({ card_type: crest.card_type, grade: "3" }),
      null,
    );
  }
  assert.equal(isCrestCard(" ride deck crest "), true);
  assert.equal(isCrestCard("Crestfallen Unit"), false);
  assert.equal(isCrestCard(null), false);
  assert.equal(cardGradeBadge(unit), "G3");
  assert.equal(
    cardGradeToApiValue({ card_type: "Normal Unit", grade: "0" }),
    "0",
  );
});

test("crest creation accepts no grade while regular cards still require one", () => {
  assert.equal(manualCardFormIsComplete(form), true);
  assert.equal(
    manualCardFormIsComplete({ ...form, card_type: "Ride Deck Crest" }),
    true,
  );
  assert.equal(
    manualCardFormIsComplete({ ...form, card_type: "Normal Unit" }),
    false,
  );
  assert.equal(
    manualCardFormIsComplete({ ...form, card_type: "Normal Unit", grade: "0" }),
    true,
  );
  assert.equal(manualCardFormIsComplete({ ...form, set_code: "" }), false);
  const converted = updateManualCardType(
    { ...form, card_type: "Normal Unit", grade: "3" },
    "Crest",
  );
  assert.equal(converted.grade, "");
  assert.equal(updateManualCardType(converted, "Normal Unit").grade, "");
  assert.equal(
    cardToManualForm({
      ...nightrose,
      name: "Nightrose",
      primary_printing: null,
      skill_text: "",
      nation: "Stoicheia",
      grade: 3,
    }).grade,
    "",
  );
});

test("crest routing cannot use main, ride or G decks and works outside a full core deck", () => {
  for (const zone of [
    "main",
    "ride",
    "g",
    "token",
    "other",
    "crest",
  ] as DeckCardZone[]) {
    assert.equal(suggestedDeckCardZone(energy, zone), "crest");
  }
  assert.equal(suggestedDeckCardZone(unit, "crest"), "main");
  assert.equal(suggestedDeckCardZone(unit, "g"), "g");
  assert.equal(cardAdditionIssue(version, nightrose, "crest", 1), null);
  assert.equal(cardAdditionIssue(version, energy, "crest", 1), null);
  assert.match(
    cardAdditionIssue(version, nightrose, "main", 1)!,
    /Crest section/,
  );
  assert.match(cardAdditionIssue(version, unit, "crest", 1)!, /Only crests/);
  assert.match(cardAdditionIssue(version, unit, "main", 1)!, /limited to 50/);
});

test("distinct crests coexist, but duplicates, extra copies and a second Ride Deck Crest are blocked", () => {
  const withEnergy = {
    ...version,
    cards: [
      {
        zone: "crest",
        card_id: energy.id,
        card: energy,
        quantity: 1,
      } as DeckCardEntry,
    ],
  };
  assert.equal(cardAdditionIssue(withEnergy, nightrose, "crest", 1), null);
  assert.match(
    cardAdditionIssue(withEnergy, energy, "crest", 1)!,
    /already included/,
  );
  assert.match(
    cardAdditionIssue(withEnergy, { ...energy, id: 9 }, "crest", 1)!,
    /Ride Deck Crest/,
  );
  assert.match(cardAdditionIssue(version, nightrose, "crest", 2)!, /one copy/);
});
