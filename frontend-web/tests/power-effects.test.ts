import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import { formatPower } from "../src/features/hand-lab/cardDisplay.ts";
import {
  beginCheck,
  changeCards,
  changePower,
  finishMulligan,
  moveCards,
  nextPhase,
  startTable,
} from "../src/features/hand-lab/playtest.ts";
import {
  applyPowerEffect,
  powerEffectAmount,
  powerMultiplierCount,
  powerTargetKeys,
  type PowerEffect,
} from "../src/features/hand-lab/powerEffects.ts";

const entries = [
  { id: 1, card_id: 1, quantity: 20, zone: "main", card: { grade: 1 } },
  { id: 2, card_id: 2, quantity: 1, zone: "ride", card: { grade: 0 } },
  { id: 3, card_id: 3, quantity: 4, zone: "g", card: { grade: 4 } },
] as DeckCardEntry[];
const effect: PowerEffect = {
  target: "front",
  amount: 10000,
  multiplier: "manual",
  count: 1,
};

function field() {
  const opening = startTable(entries, true, "2:0", seededRandom(2));
  let session = finishMulligan(opening, []);
  const hand = session.zones.hand;
  const circles = [
    "frontLeft",
    "frontRight",
    "backCenter",
    "guardian",
  ] as const;
  for (const [index, zone] of circles.entries())
    session = moveCards(session, [hand[index].key], zone);
  return session;
}

test("front bonuses affect current front-row units once, including rested units", () => {
  const initial = field();
  const rested = changeCards(initial, [initial.zones.frontLeft[0].key], "rest");
  const snapshot = JSON.stringify(rested);
  const next = applyPowerEffect(rested, [], effect);
  for (const zone of ["vanguard", "frontLeft", "frontRight"] as const)
    assert.equal(next.zones[zone][0].power, 10000);
  assert.equal(next.zones.frontLeft[0].rested, true);
  assert.equal(next.zones.backCenter[0].power, 0);
  assert.equal(next.zones.guardian[0].power, 0);
  assert.equal(next.zones.hand[0].power, 0);
  assert.equal(
    JSON.stringify(rested),
    snapshot,
    "undo retains the previous field",
  );
  assert.equal(
    next.log.length,
    rested.log.length + 1,
    "one effect is one action",
  );
  const replacement = moveCards(next, [next.zones.hand[0].key], "frontLeft");
  assert.equal(
    replacement.zones.frontLeft[0].power,
    0,
    "later calls do not inherit a front trigger",
  );
});

test("selected, rear-guard, and field targets exclude cards outside unit circles", () => {
  const session = field();
  const key = session.zones.vanguard[0].key;
  const selected = [key, key, "missing", session.zones.hand[0].key];
  assert.deepEqual(powerTargetKeys(session, "selected", selected), [key]);
  assert.equal(powerTargetKeys(session, "rear", []).length, 3);
  assert.equal(powerTargetKeys(session, "field", []).length, 4);
  const selectedEffect: PowerEffect = { ...effect, target: "selected" };
  const next = applyPowerEffect(session, selected, selectedEffect);
  assert.equal(next.zones.vanguard[0].power, 10000);
  assert.equal(next.zones.frontLeft[0].power, 0);
  assert.equal(applyPowerEffect(session, [], selectedEffect), session);
});

test("Over Trigger power adds to existing bonuses without resolving the pending check", () => {
  const session = beginCheck(field(), "damage");
  const key = session.zones.vanguard[0].key;
  const boosted = changeCards(session, [key], "power+");
  const next = changeCards(boosted, [key], "power+100m");
  assert.equal(next.zones.vanguard[0].power, 100_005_000);
  assert.deepEqual(next.check, session.check);
  assert.deepEqual(next.zones.reveal, session.zones.reveal);
  assert.deepEqual(next.zones.deck, session.zones.deck);
  assert.deepEqual(next.zones.hand, session.zones.hand);
  assert.equal(formatPower(next.zones.vanguard[0], 13000), "100,018,000");
  assert.equal(formatPower(next.zones.vanguard[0], 13000, true), "100.018M");
  assert.equal(formatPower(next.zones.vanguard[0], null, true), "+100.005M");
});

test("selected +10k is one reversible field action and leaves a check pending", () => {
  const checked = beginCheck(field(), "damage");
  const vanguard = checked.zones.vanguard[0].key;
  const rearGuard = checked.zones.frontLeft[0].key;
  const initial = changeCards(checked, [rearGuard], "power+2k");
  const snapshot = JSON.stringify(initial);
  const next = changeCards(
    initial,
    [vanguard, rearGuard, rearGuard],
    "power+10k",
  );

  assert.equal(next.zones.vanguard[0].power, 10000);
  assert.equal(next.zones.frontLeft[0].power, 12000);
  assert.equal(next.zones.frontRight[0].power, 0);
  assert.equal(next.log.length, initial.log.length + 1);
  assert.deepEqual(next.check, initial.check);
  assert.deepEqual(next.zones.reveal, initial.zones.reveal);
  assert.deepEqual(next.zones.deck, initial.zones.deck);
  assert.deepEqual(next.zones.hand, initial.zones.hand);
  assert.equal(
    JSON.stringify(initial),
    snapshot,
    "undo keeps the complete previous state",
  );
});

test("selected +10k rejects pile cards, crests, mulligan and overflow atomically", () => {
  const session = field();
  const unit = session.zones.vanguard[0].key;
  const pileCards = [
    session.zones.hand[0],
    session.zones.guardian[0],
    session.zones.g[0],
  ];
  for (const card of pileCards) {
    assert.equal(changeCards(session, [card.key], "power+10k"), session);
    assert.equal(changeCards(session, [unit, card.key], "power+10k"), session);
  }
  assert.equal(changeCards(session, [unit, "missing"], "power+10k"), session);
  assert.equal(changeCards(session, [], "power+10k"), session);

  const crestSession = {
    ...session,
    zones: {
      ...session.zones,
      vanguard: [{ ...session.zones.vanguard[0], crest: true as const }],
    },
  };
  assert.equal(changeCards(crestSession, [unit], "power+10k"), crestSession);
  const opening = startTable(entries, true, "2:0", seededRandom(2));
  assert.equal(changeCards(opening, [unit], "power+10k"), opening);
  const atLimit = changePower(session, [unit], Number.MAX_SAFE_INTEGER);
  assert.equal(
    changeCards(atLimit, [unit, session.zones.frontLeft[0].key], "power+10k"),
    atLimit,
  );
});

test("G-zone multipliers use the chosen count at application and start face down", () => {
  const initial = field();
  assert.equal(
    initial.zones.g.every((card) => card.faceDown),
    true,
  );
  assert.equal(powerMultiplierCount(initial, "gTotal", 9), 4);
  assert.equal(powerMultiplierCount(initial, "gFaceUp", 9), 0);
  const scaled: PowerEffect = {
    ...effect,
    amount: 5000,
    multiplier: "gFaceUp",
  };
  assert.equal(applyPowerEffect(initial, [], scaled), initial);
  const flipped = changeCards(
    initial,
    initial.zones.g.slice(0, 2).map((card) => card.key),
    "flip",
  );
  const next = applyPowerEffect(flipped, [], scaled);
  assert.equal(next.zones.vanguard[0].power, 10000);
  const flippedAgain = changeCards(next, [next.zones.g[2].key], "flip");
  assert.equal(
    flippedAgain.zones.vanguard[0].power,
    10000,
    "counts are not ongoing effects",
  );
  const moved = moveCards(
    flippedAgain,
    [flippedAgain.zones.g[3].key],
    "reserve",
  );
  assert.equal(powerMultiplierCount(moved, "gTotal", 9), 3);
  const total = applyPowerEffect(initial, [], {
    ...scaled,
    multiplier: "gTotal",
  });
  assert.equal(total.zones.vanguard[0].power, 20000);
  const manual = applyPowerEffect(initial, [], {
    ...scaled,
    multiplier: "manual",
    count: 3,
  });
  assert.equal(manual.zones.vanguard[0].power, 15000);
});

test("power effects reject invalid input and overflow without a partial update", () => {
  const session = field();
  const key = session.zones.vanguard[0].key;
  const invalidInputs = [
    [0, 1],
    [1.5, 1],
    [1000, 0],
    [1000, -1],
    [1000, 1.5],
    [Infinity, 1],
    [NaN, 1],
    [Number.MAX_SAFE_INTEGER, 2],
  ];
  for (const [amount, count] of invalidInputs) {
    assert.equal(powerEffectAmount(amount, count), null);
    assert.equal(
      applyPowerEffect(session, [], { ...effect, amount, count }),
      session,
    );
  }
  const atLimit = changePower(session, [key], Number.MAX_SAFE_INTEGER);
  assert.equal(applyPowerEffect(atLimit, [], effect), atLimit);
  const reduced = changePower(session, [key, key], -2000);
  assert.equal(reduced.zones.vanguard[0].power, -2000);
  const opening = startTable(entries, true, "2:0", seededRandom(2));
  assert.equal(applyPowerEffect(opening, [], effect), opening);
});

test("turn bonuses expire after either player's turn, including damage-trigger power", () => {
  const initial = field();
  const key = initial.zones.vanguard[0].key;
  const boosted = changeCards(
    applyPowerEffect(initial, [], effect),
    [key],
    "critical+",
  );
  for (const active of ["you", "opponent"] as const) {
    const next = nextPhase({ ...boosted, phase: "end", active });
    for (const zone of Object.values(next.zones))
      for (const card of zone) {
        assert.equal(card.power, 0);
        assert.equal(card.critical, 0);
      }
  }
});
