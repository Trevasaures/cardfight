import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  attackCard,
  beginCheck,
  canAttack,
  canDropCards,
  changeCards,
  changeEnergy,
  finishMulligan,
  getDriveAttacker,
  listCopies,
  moveCards,
  nextPhase,
  resolveCheck,
  shuffleDeck,
  startTable,
  takeTop,
  ZONES,
  type TableSession,
  type Zone,
} from "../src/features/hand-lab/playtest.ts";

const entries = [
  { id: 1, card_id: 1, quantity: 30, zone: "main", card: { grade: 1 } },
  { id: 2, card_id: 2, quantity: 20, zone: "main", card: { grade: 0 } },
  ...[0, 1, 2, 3].map((grade) => ({
    id: 10 + grade,
    card_id: 10 + grade,
    quantity: 1,
    zone: "ride",
    card: { grade },
  })),
  { id: 20, card_id: 20, quantity: 2, zone: "g", card: { grade: 4 } },
  { id: 21, card_id: 21, quantity: 3, zone: "token", card: { grade: 0 } },
  { id: 22, card_id: 22, quantity: 1, zone: "other", card: { grade: null } },
] as DeckCardEntry[];
const fresh = (first = true) =>
  startTable(entries, first, "10:0", seededRandom(13));
const ready = (first = true) => finishMulligan(fresh(first), []);
const battleReady = () => {
  let session = nextPhase(ready(false));
  for (let i = 0; i < 4; i++) session = nextPhase(session);
  return session;
};
const inventory = (session: TableSession) =>
  Object.values(session.zones)
    .flat()
    .map((card) => card.key)
    .sort();

test("setup separates auxiliary cards and places the ride starter before dealing", () => {
  const session = fresh();
  assert.equal(session.zones.vanguard[0].key, "10:0");
  assert.equal(session.zones.ride.length, 3);
  assert.equal(session.zones.hand.length, 5);
  assert.equal(session.zones.deck.length, 45);
  assert.equal(session.zones.g.length, 2);
  assert.equal(session.zones.token.length, 3);
  assert.equal(session.zones.reserve.length, 1);
  assert.deepEqual(
    inventory(session),
    listCopies(entries)
      .map((card) => card.key)
      .sort(),
  );
  assert.equal(new Set(inventory(session)).size, 60);
});

test("main-deck starter is removed from the draw pool and invalid starters fail", () => {
  const session = startTable(entries, true, "2:0", seededRandom(1));
  assert.equal(session.zones.deck.length, 44);
  assert.ok(
    ![...session.zones.hand, ...session.zones.deck].some(
      (card) => card.key === "2:0",
    ),
  );
  assert.throws(() => startTable(entries, true, "1:0"), /grade 0/);
  assert.throws(() => startTable(entries, true, "missing"), /grade 0/);
  assert.throws(
    () => listCopies([{ ...entries[0], card: null }]),
    /unavailable/,
  );
  assert.equal(startTable(entries, true, null).zones.vanguard.length, 0);
});

test("mulligan is single-use, blocks play actions, and preserves all physical copies", () => {
  const session = fresh();
  assert.equal(takeTop(session, "hand"), session);
  assert.equal(nextPhase(session), session);
  assert.equal(beginCheck(session, "damage"), session);
  assert.equal(shuffleDeck(session), session);
  assert.equal(changeEnergy(session, 1), session);
  const next = finishMulligan(
    session,
    session.zones.hand.slice(0, 2).map((card) => card.key),
    seededRandom(2),
  );
  assert.deepEqual(
    next.zones.hand.slice(-2).map((card) => card.key),
    session.zones.deck.slice(0, 2).map((card) => card.key),
  );
  assert.equal(finishMulligan(next, []), next);
  assert.deepEqual(inventory(next), inventory(session));
});

test("going first draws on turn one and skips its battle phase", () => {
  let session = ready();
  assert.equal(session.turn, 1);
  assert.equal(session.phase, "stand");
  session = nextPhase(session);
  assert.equal(session.phase, "draw");
  assert.equal(session.zones.hand.length, 6);
  session = nextPhase(nextPhase(session));
  assert.equal(session.phase, "main");
  session = nextPhase(session);
  assert.equal(session.phase, "end");
  session = nextPhase(session);
  assert.equal(session.active, "opponent");
  session = nextPhase(session);
  assert.equal(session.turn, 2);
  assert.equal(session.phase, "stand");
  assert.equal(
    session.zones.hand.length,
    6,
    "draw happens only when entering draw phase",
  );
});

test("going second starts with opponent and permits battle on the first own turn", () => {
  let session = ready(false);
  assert.equal(session.turn, 0);
  assert.equal(session.active, "opponent");
  session = nextPhase(session);
  assert.equal(session.turn, 1);
  for (let i = 0; i < 4; i++) session = nextPhase(session);
  assert.equal(session.phase, "battle");
  assert.equal(session.zones.hand.length, 6);
});

test("riding moves the previous vanguard to soul; calling over a rear-guard retires it", () => {
  const initial = ready();
  let session = moveCards(initial, ["11:0"], "vanguard");
  assert.equal(session.zones.soul[0].key, "10:0");
  assert.equal(session.zones.vanguard[0].key, "11:0");
  const [one, two] = session.zones.hand;
  session = moveCards(session, [one.key], "frontLeft");
  session = moveCards(session, [two.key], "frontLeft");
  assert.equal(session.zones.drop[0].key, one.key);
  assert.equal(session.zones.frontLeft[0].key, two.key);
  assert.deepEqual(inventory(session), inventory(initial));
  assert.equal(
    initial.zones.soul.length,
    0,
    "previous snapshots remain usable for undo",
  );
});

test("movement handles duplicate selections, occupied circles, and deck top/bottom ordering", () => {
  const initial = ready();
  const [one, two] = initial.zones.hand;
  assert.equal(moveCards(initial, [one.key, two.key], "vanguard"), initial);
  const next = moveCards(initial, [one.key, one.key, "missing"], "deck", "top");
  assert.equal(next.zones.deck[0].key, one.key);
  const bottom = moveCards(next, [one.key], "deck", "bottom");
  assert.equal(bottom.zones.deck.at(-1)?.key, one.key);
  assert.deepEqual(inventory(bottom), inventory(initial));
});

test("temporary rides from hand or drop uncover the prior vanguard when moved away", () => {
  for (const source of ["hand", "drop"] as const) {
    let base = ready();
    for (const key of ["11:0", "12:0", "13:0"])
      base = moveCards(base, [key], "vanguard");
    const form = base.zones.hand[0].key;
    if (source === "drop") base = moveCards(base, [form], "drop");
    const covered = moveCards(base, [form], "vanguard");
    const attacked = attackCard({ ...covered, phase: "battle" }, form);
    const previous = JSON.stringify(attacked);
    const returned = moveCards(attacked, [form], "bind");

    assert.equal(returned.zones.vanguard[0].key, "13:0");
    assert.equal(returned.zones.vanguard[0].rested, false);
    assert.equal(returned.zones.bind.at(-1)?.key, form);
    assert.deepEqual(
      returned.zones.soul.map((card) => card.key),
      ["10:0", "11:0", "12:0"],
    );
    assert.equal(returned.attackerKey, null);
    assert.deepEqual(inventory(returned), inventory(base));
    assert.equal(
      JSON.stringify(attacked),
      previous,
      "undo retains the entire covered stack",
    );
  }
});

test("charging and blasting soul preserve the next vanguard in stack order", () => {
  let session = moveCards(ready(), ["13:0"], "vanguard");
  const form = session.zones.hand[0].key;
  session = moveCards(session, [form], "vanguard");
  const charged = session.zones.deck[0].key;
  session = takeTop(session, "soul");
  assert.deepEqual(
    session.zones.soul.map((card) => card.key),
    [charged, "10:0", "13:0"],
  );
  session = moveCards(session, [charged], "drop");
  assert.equal(
    session.zones.vanguard[0].key,
    form,
    "soul blast does not replace the active vanguard",
  );
  session = moveCards(session, [form], "hand");
  assert.equal(session.zones.vanguard[0].key, "13:0");
  session = moveCards(session, ["13:0"], "deck", "bottom");
  assert.equal(session.zones.vanguard[0].key, "10:0");
  assert.equal(session.zones.deck.at(-1)?.key, "13:0");
});

test("uncovering skips selected soul copies and leaves an exhausted stack empty", () => {
  const initial = ready();
  let session = moveCards(initial, ["11:0"], "vanguard");
  session = moveCards(session, ["12:0"], "vanguard");
  session = moveCards(session, ["12:0", "11:0"], "drop");
  assert.equal(session.zones.vanguard[0].key, "10:0");
  assert.equal(session.zones.soul.length, 0);
  session = moveCards(session, ["10:0"], "soul");
  assert.equal(
    session.zones.vanguard.length,
    0,
    "a moved vanguard cannot uncover itself",
  );
  assert.deepEqual(session.zones.soul.map((card) => card.key), ["10:0"]);
  assert.deepEqual(inventory(session), inventory(initial));
});

test("riding a soul card and moving the vanguard into soul never duplicates a copy", () => {
  let session = moveCards(ready(), ["11:0"], "vanguard");
  session = moveCards(session, ["12:0"], "vanguard");
  const original = inventory(session);
  session = moveCards(session, ["10:0"], "vanguard");
  assert.deepEqual(session.zones.soul.map((card) => card.key), ["11:0", "12:0"]);
  session = moveCards(session, ["10:0"], "soul");
  assert.equal(session.zones.vanguard[0].key, "12:0");
  assert.deepEqual(session.zones.soul.map((card) => card.key), ["10:0", "11:0"]);
  assert.deepEqual(inventory(session), original);
});

test("2k and 5k power adjustments combine and clear at the turn boundary", () => {
  const initial = ready();
  const key = initial.zones.vanguard[0].key;
  let session = changeCards(initial, [key], "power+2k");
  session = changeCards(session, [key], "power+");
  assert.equal(session.zones.vanguard[0].power, 7000);
  session = changeCards(session, [key], "power-2k");
  assert.equal(session.zones.vanguard[0].power, 5000);
  session = changeCards(session, [key], "power-");
  session = changeCards(session, [key], "power-2k");
  assert.equal(session.zones.vanguard[0].power, -2000);
  assert.equal(initial.zones.vanguard[0].power, 0);
  assert.equal(nextPhase({ ...session, phase: "end" }).zones.vanguard[0].power, 0);
});

test("checks reveal one copy, wait for resolution, and route to the right zone", () => {
  const initial = battleReady();
  const checked = beginCheck(initial, "damage");
  assert.equal(checked.zones.reveal[0].key, initial.zones.deck[0].key);
  assert.equal(beginCheck(checked, "drive"), checked);
  assert.equal(nextPhase(checked), checked);
  const resolved = resolveCheck(checked);
  assert.equal(resolved.zones.damage.length, 1);
  assert.equal(resolved.check, null);
  const driven = resolveCheck(beginCheck(resolved, "drive"));
  assert.equal(driven.zones.hand.length, initial.zones.hand.length + 1);
  assert.deepEqual(inventory(driven), inventory(initial));
  const manual = moveCards(checked, [checked.check!.key], "bind");
  assert.equal(
    manual.check,
    null,
    "manual effect resolution must not leave a stuck check",
  );
});

test("attacking rests only the chosen front-row unit without revealing or mutating the prior snapshot", () => {
  for (const zone of ["vanguard", "frontLeft", "frontRight"] as const) {
    let initial = battleReady();
    if (zone !== "vanguard") {
      initial = moveCards(initial, [initial.zones.hand[0].key], zone);
    }
    const key = initial.zones[zone][0].key;
    initial = changeCards(initial, [key], "power+");
    const previous = JSON.stringify(initial);
    const attacked = attackCard(initial, key);

    assert.equal(canAttack(initial, key), true);
    assert.equal(attacked.zones[zone][0].rested, true);
    assert.equal(attacked.zones[zone][0].power, 5000);
    assert.equal(attacked.attackerKey, key);
    assert.equal(attacked.check, null);
    assert.deepEqual(attacked.zones.deck, initial.zones.deck);
    assert.deepEqual(attacked.zones.reveal, initial.zones.reveal);
    assert.deepEqual(inventory(attacked), inventory(initial));
    assert.equal(
      JSON.stringify(initial),
      previous,
      "undo can restore the prior snapshot",
    );
    if (zone !== "vanguard")
      assert.equal(attacked.zones.vanguard[0].rested, false);

    assert.equal(
      attackCard(attacked, key),
      attacked,
      "a rested unit cannot attack again",
    );
    const stood = changeCards(attacked, [key], "rest");
    assert.equal(attackCard(stood, key).zones[zone][0].rested, true);
  }
});

test("attacks require a standing front-row unit during your battle phase with no pending check", () => {
  const initial = battleReady();
  const key = initial.zones.vanguard[0].key;
  const blocked: TableSession[] = [
    fresh(),
    ready(),
    { ...initial, phase: "main" },
    { ...initial, active: "opponent" },
    changeCards(initial, [key], "flip"),
    beginCheck(initial, "damage"),
  ];
  for (const session of blocked) {
    assert.equal(canAttack(session, key), false);
    assert.equal(attackCard(session, key), session);
  }
  assert.equal(attackCard(initial, "missing"), initial);
  const handKey = initial.zones.hand[0].key;
  assert.equal(attackCard(initial, handKey), initial);
  for (const zone of [
    "backLeft",
    "backCenter",
    "backRight",
    "guardian",
  ] as const) {
    const called = moveCards(initial, [handKey], zone);
    assert.equal(attackCard(called, handKey), called);
  }
});

test("direct and repeated vanguard drive checks rest the vanguard without toggling it back to stand", () => {
  const initial = battleReady();
  const previous = JSON.stringify(initial);
  const first = beginCheck(initial, "drive");
  assert.equal(first.zones.vanguard[0].rested, true);
  assert.equal(first.attackerKey, initial.zones.vanguard[0].key);
  assert.equal(first.check?.key, initial.zones.deck[0].key);
  assert.equal(
    beginCheck(first, "drive"),
    first,
    "resolve each check before revealing another",
  );
  const second = beginCheck(resolveCheck(first), "drive");
  assert.equal(second.zones.vanguard[0].rested, true);
  assert.equal(second.check?.key, initial.zones.deck[1].key);
  const resolved = resolveCheck(second);
  assert.equal(resolved.zones.hand.length, initial.zones.hand.length + 2);
  assert.deepEqual(inventory(resolved), inventory(initial));
  assert.equal(JSON.stringify(initial), previous);
});

test("optional rear-guard drive checks keep their source across checks and leave the vanguard standing", () => {
  const initial = battleReady();
  const key = initial.zones.hand[0].key;
  const called = moveCards(initial, [key], "frontLeft");
  const attacked = attackCard(called, key);
  assert.equal(
    attacked.check,
    null,
    "rear-guard attacks never start a drive check automatically",
  );
  assert.equal(getDriveAttacker(attacked)?.card.key, key);
  const first = beginCheck(attacked, "drive");
  const second = beginCheck(resolveCheck(first), "drive");
  assert.equal(second.zones.frontLeft[0].rested, true);
  assert.equal(second.zones.vanguard[0].rested, false);
  assert.equal(second.attackerKey, key);
  assert.deepEqual(inventory(second), inventory(initial));

  const direct = beginCheck(called, "drive", key);
  assert.equal(direct.zones.frontLeft[0].rested, true);
  assert.equal(direct.zones.vanguard[0].rested, false);
  const vanguardKey = called.zones.vanguard[0].key;
  const switched = beginCheck(resolveCheck(direct), "drive", vanguardKey);
  assert.equal(switched.attackerKey, vanguardKey);
  assert.equal(switched.zones.vanguard[0].rested, true);
});

test("blocked drive checks and damage checks do not rest any unit", () => {
  const initial = battleReady();
  const key = initial.zones.vanguard[0].key;
  const blocked: TableSession[] = [
    fresh(),
    ready(),
    { ...initial, active: "opponent" },
    changeCards(initial, [key], "flip"),
    moveCards(initial, [key], "soul"),
    moveCards(
      initial,
      initial.zones.deck.map((card) => card.key),
      "drop",
    ),
    beginCheck(initial, "damage"),
  ];
  for (const session of blocked) {
    assert.equal(beginCheck(session, "drive"), session);
  }
  assert.equal(beginCheck(initial, "drive", "missing"), initial);
  const handKey = initial.zones.hand[0].key;
  assert.equal(beginCheck(initial, "drive", handKey), initial);
  const backRow = moveCards(initial, [handKey], "backLeft");
  assert.equal(beginCheck(backRow, "drive", handKey), backRow);
  const damage = beginCheck(ready(false), "damage");
  assert.equal(damage.check?.kind, "damage");
  assert.equal(damage.zones.vanguard[0].rested, false);
  assert.equal(damage.attackerKey, null);
});

test("leaving battle or removing the attacking unit clears the drive-check source", () => {
  const initial = battleReady();
  const key = initial.zones.hand[0].key;
  const attacked = attackCard(moveCards(initial, [key], "frontRight"), key);
  assert.equal(nextPhase(attacked).attackerKey, null);
  assert.equal(moveCards(attacked, [key], "drop").attackerKey, null);
  assert.equal(moveCards(attacked, [key], "backRight").attackerKey, null);
  const replaced = moveCards(
    attacked,
    [attacked.zones.hand[0].key],
    "frontRight",
  );
  assert.equal(replaced.attackerKey, null);
  assert.equal(getDriveAttacker(replaced)?.zone, "vanguard");
  assert.equal(attacked.attackerKey, key, "undo retains the original attacker");
});

test("damage flips and resource adjustments preserve cards; energy stays in range", () => {
  let session = takeTop(ready(), "damage");
  const key = session.zones.damage[0].key;
  session = changeCards(session, [key], "flip");
  assert.equal(session.zones.damage[0].faceDown, true);
  session = changeCards(session, [key], "flip");
  assert.equal(session.zones.damage[0].faceDown, false);
  assert.equal(changeEnergy(session, 20).energy, 10);
  assert.equal(changeEnergy(session, -20).energy, 0);
});

test("rear-guard movement preserves rest and bonuses; turn boundary clears bonuses and stands units", () => {
  let session = ready();
  const card = session.zones.hand[0];
  session = moveCards(session, [card.key], "backLeft");
  session = changeCards(
    changeCards(changeCards(session, [card.key], "rest"), [card.key], "power+"),
    [card.key],
    "critical+",
  );
  session = moveCards(session, [card.key], "frontLeft");
  assert.equal(session.zones.frontLeft[0].rested, true);
  assert.equal(session.zones.frontLeft[0].power, 5000);
  while (session.active === "you") session = nextPhase(session);
  assert.equal(session.zones.frontLeft[0].power, 0);
  assert.equal(session.zones.frontLeft[0].critical, 0);
  assert.equal(session.zones.frontLeft[0].rested, true);
  session = nextPhase(session);
  assert.equal(session.zones.frontLeft[0].rested, false);
});

test("exhausted deck does not duplicate cards or create pending checks", () => {
  let session = ready();
  for (let i = 0; i < 50; i++) session = takeTop(session, "hand");
  assert.equal(session.zones.deck.length, 0);
  assert.equal(takeTop(session, "hand"), session);
  assert.equal(beginCheck(session, "damage"), session);
  assert.equal(nextPhase(session).zones.hand.length, 50);
});

test("a long sandbox sequence conserves the full inventory across every zone", () => {
  let session = ready();
  const original = inventory(session);
  const random = seededRandom(44);
  const zones = Object.keys(ZONES) as Zone[];
  for (let i = 0; i < 400; i++) {
    const key = original[Math.floor(random() * original.length)];
    const to = zones[Math.floor(random() * zones.length)];
    const previous = JSON.stringify(session);
    const next = moveCards(session, [key], to);
    assert.equal(JSON.stringify(session), previous);
    assert.deepEqual(inventory(next), original);
    session = next;
  }
});

test("drop validation rejects opening-hand moves, stale copies, and empty drags", () => {
  const opening = fresh();
  assert.equal(
    canDropCards(opening, [opening.zones.hand[0].key], "drop"),
    false,
  );
  const session = ready();
  assert.equal(canDropCards(session, [], "drop"), false);
  assert.equal(canDropCards(session, ["missing"], "drop"), false);
  assert.equal(
    canDropCards(session, [session.zones.hand[0].key, "missing"], "drop"),
    false,
  );
});

test("multiple selected cards can enter a pile but never partially fill a circle", () => {
  const session = ready();
  const keys = session.zones.hand.slice(0, 2).map((card) => card.key);
  assert.equal(canDropCards(session, keys, "drop"), true);
  assert.equal(canDropCards(session, keys, "vanguard"), false);
  const called = moveCards(session, [keys[0]], "frontLeft");
  assert.equal(canDropCards(called, keys, "frontLeft"), false);
  const discarded = moveCards(session, keys, "drop");
  assert.equal(discarded.zones.drop.length, 2);
  assert.deepEqual(inventory(discarded), inventory(session));
});

test("dropping onto the source zone is a no-op except deliberate deck reordering", () => {
  const session = ready();
  assert.equal(
    canDropCards(session, [session.zones.hand[0].key], "hand"),
    false,
  );
  assert.equal(
    canDropCards(session, [session.zones.deck[0].key], "deck"),
    true,
  );
  assert.equal(
    canDropCards(session, [session.zones.hand[0].key], "frontLeft"),
    true,
  );
  const called = moveCards(session, [session.zones.hand[0].key], "frontLeft");
  assert.equal(
    canDropCards(called, [called.zones.frontLeft[0].key], "hand"),
    true,
  );
});
