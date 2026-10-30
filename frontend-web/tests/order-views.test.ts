import assert from "node:assert/strict";
import test from "node:test";
import type { AcquisitionPlanItem } from "../src/types/api.ts";
import {
  checklistItems,
  outgoingItems,
  matchesItemFilter,
  selectablePurchaseItems,
} from "../src/components/order-tracker/order-views.ts";

const cut = {
  id: 1,
  target_quantity: 0,
  source_quantity: 2,
  removed_quantity: 2,
  owned_quantity: 2,
  ordered_quantity: 0,
  available_quantity: 0,
  missing_quantity: 0,
  card: { name: "Outgoing order" },
  printing: { rarity: "RRR", card_number: "001EN" },
  notes: "Keep printing",
} as AcquisitionPlanItem;
const partial = {
  ...cut,
  id: 2,
  source_quantity: 4,
  target_quantity: 2,
  available_quantity: 2,
};
const missing = {
  ...cut,
  id: 3,
  target_quantity: 3,
  source_quantity: 0,
  removed_quantity: 0,
  missing_quantity: 3,
};

test("full cuts leave default purchase work but remain in All cards through outgoing review", () => {
  const items = [cut, partial, missing];
  assert.deepEqual(
    checklistItems(items, "changes", "").map((item) => item.id),
    [2, 3],
  );
  assert.deepEqual(outgoingItems(items, ""), [cut]);
  assert.equal(matchesItemFilter(cut, "all"), true);
  assert.deepEqual(checklistItems(items, "all", ""), [partial, missing]);
});

test("partial reductions count as ready for the retained target with separate outgoing work", () => {
  assert.equal(matchesItemFilter(partial, "owned"), true);
  assert.equal(matchesItemFilter(partial, "changes"), true);
  assert.equal(matchesItemFilter(cut, "owned"), false);
  assert.equal(matchesItemFilter(cut, "needed"), false);
  assert.equal(matchesItemFilter(missing, "needed"), true);
});

test("incoming full cuts stay accessible without joining next-build bulk selection", () => {
  const incomingCut = {
    ...cut,
    ordered_quantity: 1,
    confirmed_removed_quantity: 2,
  };
  assert.equal(matchesItemFilter(incomingCut, "incoming"), true);
  assert.deepEqual(outgoingItems([cut, incomingCut, partial], "", true), [
    incomingCut,
  ]);
  assert.deepEqual(selectablePurchaseItems([incomingCut, partial, missing]), [
    partial,
    missing,
  ]);
});

test("printing and note searches find removal history; archived views preserve all records", () => {
  assert.deepEqual(outgoingItems([cut, partial], "001en"), [cut]);
  assert.deepEqual(outgoingItems([cut], "keep printing"), [cut]);
  assert.deepEqual(outgoingItems([cut], "other"), []);
  assert.deepEqual(checklistItems([cut, partial], "needed", "", true), [partial]);
});

test("zero targets from new-build printing splits remain inspectable and never count ready", () => {
  const zero = { ...cut, source_quantity: 0, removed_quantity: 0 };
  assert.equal(matchesItemFilter(zero, "owned"), false);
  assert.equal(matchesItemFilter(zero, "changes"), false);
  assert.deepEqual(checklistItems([zero], "all", ""), [zero]);
  assert.deepEqual(outgoingItems([zero], ""), []);
});
