import assert from "node:assert/strict";
import test from "node:test";
import {
  createItemDraft,
  isItemDraftDirty,
  isItemDraftValid,
  itemDraftPayload,
  withoutDraft,
} from "../src/components/order-tracker/order-drafts.ts";
import type { AcquisitionPlanItem } from "../src/types/api.ts";

const item = {
  id: 7,
  target_quantity: 4,
  owned_quantity: 1,
  ordered_quantity: 2,
  unit_price_cents: 175,
  printing_id: 12,
} as AcquisitionPlanItem;

test("purchase drafts retain incomplete input and reject invalid quantities before save", () => {
  const draft = { ...createItemDraft(item), owned: "" };
  assert.equal(draft.owned, "");
  assert.equal(isItemDraftDirty(item, draft), true);
  assert.equal(isItemDraftValid(draft, 1), false);
  assert.equal(isItemDraftDirty({ ...item, owned_quantity: 0 }, draft), true);
  assert.equal(isItemDraftValid({ ...draft, owned: "1.5" }, 1), false);
  assert.equal(isItemDraftValid({ ...draft, owned: "-1" }, 1), false);
  assert.equal(
    isItemDraftValid({ ...draft, owned: "1", price: "NaN" }, 1),
    false,
  );
});

test("purchase drafts round cents, keep the printing, and support removing old deck copies", () => {
  const draft = { ...createItemDraft(item), target: "0", price: "1.759" };
  assert.equal(isItemDraftValid(draft, 0), true);
  assert.equal(isItemDraftValid(draft, 1), false);
  assert.deepEqual(itemDraftPayload(draft), {
    target_quantity: 0,
    owned_quantity: 1,
    ordered_quantity: 2,
    unit_price_cents: 176,
    printing_id: 12,
  });
  assert.equal(isItemDraftDirty(item, createItemDraft(item)), false);
});

test("saving or discarding one draft preserves all other line drafts", () => {
  const otherDraft = { ...createItemDraft(item), incoming: "4" };
  const drafts = { "7": createItemDraft(item), "8": otherDraft };
  const remaining = withoutDraft(drafts, "7");
  assert.deepEqual(remaining, { "8": otherDraft });
  assert.equal(remaining["8"], otherDraft);
  assert.ok(drafts["7"], "the previous state is not mutated");
});
