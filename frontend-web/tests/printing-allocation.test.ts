import assert from "node:assert/strict";
import test from "node:test";
import type { AcquisitionPlanItem } from "../src/types/api.ts";
import {
  maximumSplitQuantity,
  parsePrintingPrice,
  printingAllocationPreview,
} from "../src/components/order-tracker/printing-allocation.ts";

const source = {
  target_quantity: 4,
  source_quantity: 0,
  owned_quantity: 2,
  ordered_quantity: 1,
} as AcquisitionPlanItem;

test("splitting a premium copy preserves total target and keeps inventory on its printing", () => {
  const preview = printingAllocationPreview(
    source,
    undefined,
    1,
    3000,
    "split",
  );
  assert.deepEqual(preview, {
    sourceTarget: 3,
    destinationTarget: 1,
    combinedTarget: 4,
    destinationEstimate: 3000,
  });
  assert.equal(source.owned_quantity, 2);
  assert.equal(source.ordered_quantity, 1);
});

test("existing destination ownership alone reduces its estimate; incoming stays in purchase total", () => {
  const destination = {
    target_quantity: 1,
    owned_quantity: 1,
    ordered_quantity: 1,
  } as AcquisitionPlanItem;
  assert.deepEqual(
    printingAllocationPreview(source, destination, 2, 275, "split"),
    {
      sourceTarget: 2,
      destinationTarget: 3,
      combinedTarget: 5,
      destinationEstimate: 550,
    },
  );
  assert.equal(
    printingAllocationPreview(source, destination, 2, 275, "add").combinedTarget,
    7,
  );
});

test("all targets may be reassigned while preserving the original printing record", () => {
  assert.equal(maximumSplitQuantity(source), 4);
  assert.equal(maximumSplitQuantity({ ...source, source_quantity: 4 }), 4);
  assert.equal(maximumSplitQuantity({ ...source, target_quantity: 1 }), 1);
});

test("dollar input converts exactly to cents and rejects fractional cents or unsafe totals", () => {
  for (const [input, expected] of [
    ["", 0],
    ["30", 3000],
    ["2.00", 200],
    ["1.01", 101],
    ["0.29", 29],
  ] as const) {
    assert.equal(parsePrintingPrice(input), expected);
  }
  for (const input of [
    "-1",
    "1.001",
    "NaN",
    "Infinity",
    "1e3",
    "9007199254740991",
  ]) {
    assert.equal(parsePrintingPrice(input), null);
  }
});
