import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  finishMulligan,
  moveCards,
  startTable,
} from "../src/features/hand-lab/playtest.ts";
import { selectedStrideTarget } from "../src/features/hand-lab/strideSelection.ts";
import { canStride, stride } from "../src/features/hand-lab/stride.ts";

const entries = [
  {
    id: 1,
    card_id: 1,
    quantity: 10,
    zone: "main",
    card: { grade: 1, card_type: "Normal Unit" },
  },
  {
    id: 2,
    card_id: 2,
    quantity: 1,
    zone: "ride",
    card: { grade: 0, card_type: "Normal Unit" },
  },
  {
    id: 3,
    card_id: 3,
    quantity: 1,
    zone: "ride",
    card: { grade: 3, power: 13000, card_type: "Normal Unit" },
  },
  {
    id: 4,
    card_id: 4,
    quantity: 2,
    zone: "g",
    card: { grade: 4, power: 15000, card_type: "G Unit" },
  },
] as DeckCardEntry[];

function ready() {
  const opening = startTable(entries, true, "2:0", seededRandom(5));
  const session = moveCards(finishMulligan(opening, []), ["3:0"], "vanguard");
  return {
    session: { ...session, phase: "main" as const },
    entries: new Map(entries.map((entry) => [entry.id, entry])),
  };
}

test("the explicit Stride action targets one G unit even with the current vanguard selected", () => {
  const context = ready();
  const heart = context.session.zones.vanguard[0];
  const unit = context.session.zones.g[0];
  const snapshot = JSON.stringify(context.session);
  for (const selection of [
    [unit.key],
    [heart.key, unit.key],
    [unit.key, heart.key],
  ]) {
    const target = selectedStrideTarget(context, selection);
    assert.equal(target?.key, unit.key);
    assert.equal(canStride(context, target!.key), true);
    const next = stride(context, target!.key);
    assert.equal(next.zones.vanguard[0].key, unit.key);
    assert.equal(next.stride?.heartKey, heart.key);
    assert.equal(
      next.zones.soul.filter((card) => card.key === heart.key).length,
      1,
    );
    assert.equal(
      next.zones.g.some((card) => card.key === unit.key),
      false,
    );
  }
  assert.equal(JSON.stringify(context.session), snapshot);
});

test("Stride selection supports face-up recovery without making mixed or multi-G moves ambiguous", () => {
  const context = ready();
  const [unit, otherGUnit] = context.session.zones.g;
  const heart = context.session.zones.vanguard[0];
  const hand = context.session.zones.hand[0];
  const faceUp = {
    ...context,
    session: {
      ...context.session,
      zones: {
        ...context.session.zones,
        g: [{ ...unit, faceDown: false }, otherGUnit],
      },
    },
  };
  assert.equal(
    selectedStrideTarget(faceUp, [heart.key, unit.key])?.key,
    unit.key,
  );
  assert.equal(canStride(faceUp, unit.key), true);
  for (const selection of [
    [],
    [heart.key],
    [unit.key, otherGUnit.key],
    [heart.key, unit.key, otherGUnit.key],
    [unit.key, hand.key],
  ]) {
    assert.equal(selectedStrideTarget(context, selection), undefined);
  }
  assert.equal(
    selectedStrideTarget(context, [unit.key, "missing"])?.key,
    unit.key,
  );
});
