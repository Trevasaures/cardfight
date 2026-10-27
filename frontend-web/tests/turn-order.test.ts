import assert from "node:assert/strict";
import test from "node:test";
import type { DeckVersion } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  finishMulligan, listCopies, nextPhase, startTable,
} from "../src/features/hand-lab/playtest.ts";
import {
  createPlaytestStore, playtestSource,
} from "../src/features/hand-lab/sessionStore.ts";
import {
  normalizeTurnOrder, resolveTurnOrder,
} from "../src/features/hand-lab/turnOrder.ts";

test("manual starting orders never toss a coin", () => {
  const unexpectedToss = () => { throw new Error("Manual choice must be deterministic"); };
  assert.equal(resolveTurnOrder("first", unexpectedToss), true);
  assert.equal(resolveTurnOrder("second", unexpectedToss), false);
});

test("random starting order splits the coin equally and consumes one result", () => {
  for (const [value, expected] of [[0, true], [0.4999, true], [0.5, false], [0.9999, false]] as const) {
    let calls = 0;
    const first = resolveTurnOrder("random", () => { calls += 1; return value; });
    assert.equal(first, expected);
    assert.equal(calls, 1);
  }
});

test("missing or invalid saved starting-order preferences fall back to random", () => {
  assert.equal(normalizeTurnOrder("first"), "first");
  assert.equal(normalizeTurnOrder("second"), "second");
  for (const value of ["random", undefined, null, false, "unknown", {}]) {
    assert.equal(normalizeTurnOrder(value), "random");
  }
});

test("a resolved toss survives mulligan, turn changes, Undo and session recovery", () => {
  const version = {
    id: 8,
    deck_id: 4,
    cards: [
      { id: 1, card_id: 1, quantity: 10, zone: "main", card: { grade: 1 } },
      { id: 2, card_id: 2, quantity: 1, zone: "ride", card: { grade: 0 } },
    ],
  } as DeckVersion;
  for (const toss of [0.25, 0.75]) {
    let calls = 0;
    const first = resolveTurnOrder("random", () => { calls += 1; return toss; });
    const dealt = startTable(version.cards, first, "2:0", seededRandom(7));
    const kept = finishMulligan(dealt, []);
    const advanced = nextPhase(kept);
    assert.equal(advanced.first, first);
    assert.equal(kept.active, first ? "you" : "opponent");

    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
    const source = playtestSource(version);
    const copies = listCopies(version.cards);
    createPlaytestStore(() => storage).save(source, {
      history: { past: [dealt, kept], present: advanced }, starterKey: "2:0",
    });
    const recovered = createPlaytestStore(() => storage).restore(source, copies).state;
    assert.ok(recovered);
    assert.equal(recovered.history.present?.first, first);
    assert.equal(recovered.history.past[0].first, first);
    assert.equal(recovered.history.past[0].phase, "mulligan");
    assert.equal(calls, 1, "recovering and returning to the deal never rerolls");
  }
});
