import assert from "node:assert/strict";
import test from "node:test";
import {
  acquisitionLineLabel,
  canChangeOrderPrinting,
  groupOrderPrintings,
  printingAlreadyTracked,
  printingLabel,
} from "../src/components/order-tracker/order-printings.ts";
import type { AcquisitionPlanItem, CardPrinting } from "../src/types/api.ts";

const base = {
  id: 1,
  rarity: "RRR",
  set_code: "DZ-BT01",
  card_number: "DZ-BT01/001EN",
} as CardPrinting;
const premium = {
  ...base,
  id: 2,
  rarity: "DFR",
  card_number: "DZ-BT01/FR01EN",
};
const row = {
  id: 10,
  card_id: 3,
  printing_id: 1,
  printing: base,
  card: { name: "Shared unit" },
  source_quantity: 0,
  owned_quantity: 0,
  ordered_quantity: 0,
} as AcquisitionPlanItem;

test("printing labels distinguish rarity and card number without conflating grade", () => {
  assert.equal(printingLabel(base), "RRR · DZ-BT01 · DZ-BT01/001EN");
  assert.equal(printingLabel(premium), "DFR · DZ-BT01 · DZ-BT01/FR01EN");
  assert.equal(printingLabel(null), "Any printing");
  assert.equal(printingLabel({ id: 7 } as CardPrinting), "Printing 7");
  assert.equal(
    acquisitionLineLabel(row),
    "Shared unit · RRR · DZ-BT01 · DZ-BT01/001EN",
  );
});

test("tracked physical copies and current deck history keep their printing identity", () => {
  assert.equal(canChangeOrderPrinting(row), true);
  for (const field of ["source_quantity", "owned_quantity", "ordered_quantity"]) {
    assert.equal(canChangeOrderPrinting({ ...row, [field]: 1 }), false);
  }
});

test("printing collisions include hidden rows, but exclude the current row and other cards", () => {
  const otherPrinting = {
    ...row,
    id: 11,
    printing_id: premium.id,
    printing: premium,
  };
  const otherCard = { ...row, id: 12, card_id: 4, printing_id: null };
  const items = [row, otherPrinting, otherCard];
  assert.equal(printingAlreadyTracked(items, row, base.id), false);
  assert.equal(printingAlreadyTracked(items, row, premium.id), true);
  assert.equal(printingAlreadyTracked(items, row, null), false);
  assert.equal(
    printingAlreadyTracked(
      [...items, { ...row, id: 13, printing_id: null }],
      row,
      null,
    ),
    true,
  );
});

test("visible printings group by shared card without losing rows or mutating quantities", () => {
  const premiumRow = {
    ...row,
    id: 11,
    printing_id: premium.id,
    printing: premium,
  };
  const unrelated = { ...row, id: 12, card_id: 4 };
  assert.deepEqual(groupOrderPrintings([row, unrelated, premiumRow]), [
    [row, premiumRow],
    [unrelated],
  ]);
  assert.deepEqual(groupOrderPrintings([premiumRow]), [[premiumRow]]);
});
