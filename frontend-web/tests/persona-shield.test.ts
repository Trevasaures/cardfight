import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  changeCards,
  beginCheck,
  finishMulligan,
  moveCards,
  nextPhase,
  PHASES,
  startTable,
  type TableSession,
} from "../src/features/hand-lab/playtest.ts";
import {
  applyRules,
  addPersonaShieldTicket,
  PERSONA_TICKET_ENTRY,
  personaState,
  removePersonaTicket,
} from "../src/features/hand-lab/rules/index.ts";

function entry(id: number, name: string, grade: number, quantity = 1, zone = "main") {
  return {
    id, card_id: id, quantity, zone,
    card: { id, name, grade, card_type: "Normal Unit", trigger_type: null },
    printing: null,
  } as DeckCardEntry;
}

const list = [
  entry(1, "Filler", 1, 10),
  entry(2, "Starter", 0, 1, "ride"),
  entry(3, "Confirmed Persona vanguard", 3, 1, "ride"),
  entry(4, "Ride candidate", 3, 1, "ride"),
  // Former automatic sources exercise the removal of acquisition prompts.
  entry(10, "Dragritter, Qawsqozah", 2),
  entry(30, "Dragritter, Nasrudin", 1),
  { ...entry(50, "Stride", 4, 1, "g"), card: { ...entry(50, "Stride", 4).card!, card_type: "G Unit" } },
  { ...entry(51, "Crest", 0, 1, "other"), card: { ...entry(51, "Crest", 0).card!, card_type: "Crest" } },
];
const entries = new Map([...list, PERSONA_TICKET_ENTRY].map((entry) => [entry.id, entry]));
const apply = (before: TableSession, after: TableSession) => applyRules(before, after, entries);
const inventory = (session: TableSession) => Object.values(session.zones).flat().filter((card) => !card.ticket).map((card) => card.key).sort();

function ready(cards = list): TableSession {
  const opening = finishMulligan(startTable(cards, true, "2:0", seededRandom(9)), []);
  return { ...moveCards(opening, ["3:0"], "vanguard"), phase: "main" };
}

function call(session: TableSession, key: string, zone: "frontLeft" | "frontRight" = "frontLeft") {
  const inHand = moveCards(session, [key], "hand");
  return apply(inHand, moveCards(inHand, [key], zone));
}

test("manual generation works with an unrecognized deck without paying implicit card costs", () => {
  const before = ready(list.slice(0, 4));
  const added = addPersonaShieldTicket(before);
  const ticket = added.zones.hand.at(-1)!;
  assert.equal(ticket.key, "ticket:personaShield:1");
  assert.equal(ticket.ticket, "personaShield");
  assert.equal(ticket.entryId, PERSONA_TICKET_ENTRY.id);
  assert.equal(ticket.cardId, PERSONA_TICKET_ENTRY.card_id);
  assert.equal(ticket.faceDown, false);
  assert.equal(ticket.rested, false);
  assert.deepEqual(added.zones.hand.slice(0, -1), before.zones.hand);
  for (const zone of Object.keys(before.zones) as (keyof TableSession["zones"])[]) {
    if (zone !== "hand") assert.deepEqual(added.zones[zone], before.zones[zone]);
  }
  assert.deepEqual(inventory(added), inventory(before));
  assert.equal(added.energy, before.energy);
  assert.equal(personaState(added).nextTicket, 2);
  assert.equal(personaState(before).nextTicket, 1, "Undo keeps the original serial and hand");
  assert.equal(before.zones.hand.some((card) => card.ticket), false);
  assert.equal(added.log.length, before.log.length + 1);
  assert.match(added.log.at(-1)!, /Persona Shield/);
});

test("manual tickets can be generated in every post-mulligan phase during either turn", () => {
  for (const active of ["you", "opponent"] as const) {
    for (const phase of PHASES.filter((phase) => phase !== "mulligan")) {
      const before = { ...ready(), active, phase };
      const added = addPersonaShieldTicket(before);
      assert.equal(added.zones.hand.filter((card) => card.ticket).length, 1, `${active} / ${phase}`);
      assert.equal(added.active, active);
      assert.equal(added.phase, phase);
    }
  }
});

test("manual generation can resolve during checks or queued deck effects without changing them", () => {
  const checking = beginCheck(ready(), "damage");
  assert.ok(checking.check);
  const added = addPersonaShieldTicket(checking);
  assert.deepEqual(added.check, checking.check);
  assert.deepEqual(added.zones.reveal, checking.zones.reveal);
  assert.equal(added.zones.hand.filter((card) => card.ticket).length, 1);
  const pending: TableSession = {
    ...ready(),
    rules: { ...ready().rules, pending: [{ rule: "xceed", nonTriggerDamageCheck: true }] },
  };
  const resolvedEffect = addPersonaShieldTicket(pending);
  assert.deepEqual(resolvedEffect.rules, pending.rules);
  assert.equal(resolvedEffect.zones.hand.filter((card) => card.ticket).length, 1);
});

test("mulligan cannot generate a ticket or advance its identity", () => {
  const opening = startTable(list, true, "2:0", seededRandom(9));
  assert.equal(addPersonaShieldTicket(opening), opening);
  assert.equal(personaState(opening).nextTicket, 1);
});

test("repeated manual additions have unique identities without a per-turn acquisition cap", () => {
  const before = ready();
  const first = addPersonaShieldTicket(before);
  const second = addPersonaShieldTicket(first);
  const third = addPersonaShieldTicket(second);
  assert.deepEqual(third.zones.hand.filter((card) => card.ticket).map((card) => card.key), [
    "ticket:personaShield:1", "ticket:personaShield:2", "ticket:personaShield:3",
  ]);
  assert.equal(personaState(third).nextTicket, 4);
  const removed = removePersonaTicket(third, "ticket:personaShield:2");
  const addedAgain = addPersonaShieldTicket(removed);
  assert.equal(addedAgain.zones.hand.at(-1)?.key, "ticket:personaShield:4");
  assert.equal(personaState(addedAgain).nextTicket, 5);
  assert.deepEqual(inventory(addedAgain), inventory(before));
  assert.equal(first.zones.hand.filter((card) => card.ticket).length, 1, "later additions do not mutate Undo frames");
});

test("ticket serials never overflow safe integer identities", () => {
  const before = ready();
  const exhausted = {
    ...before,
    persona: { ...personaState(before), nextTicket: Number.MAX_SAFE_INTEGER },
  };
  assert.equal(addPersonaShieldTicket(exhausted), exhausted);
});

test("legacy source cards never grant tickets or create acquisition prompts when called, discarded, or moved", () => {
  for (const key of ["10:0", "30:0"]) {
    const before = ready();
    const called = call(before, key);
    const fromDeck = moveCards(before, [key], "deck");
    const calledFromDeck = apply(fromDeck, moveCards(fromDeck, [key], "frontLeft"));
    const ride = { ...moveCards(before, [key], "hand"), phase: "ride" as const };
    const discarded = apply(ride, moveCards(ride, [key], "drop"));
    const moved = apply(called, moveCards(called, [key], "frontRight"));
    const rested = apply(moved, changeCards(moved, [key], "rest"));
    for (const session of [called, calledFromDeck, discarded, moved, rested]) {
      assert.equal(session.zones.hand.some((card) => card.ticket), false);
      assert.deepEqual(personaState(session), personaState(before));
    }
    assert.notEqual(nextPhase(discarded), discarded, "source movement does not block the phase");
    assert.notEqual(beginCheck(called, "damage"), called, "source movement does not block checks");
  }
});

test("manual use removes only the chosen ticket during either turn", () => {
  for (const active of ["you", "opponent"] as const) {
    const before = addPersonaShieldTicket(addPersonaShieldTicket({ ...ready(), active }));
    const snapshot = structuredClone(before);
    const removed = removePersonaTicket(before, "ticket:personaShield:1");
    assert.equal(removed.zones.hand.some((card) => card.key === "ticket:personaShield:1"), false);
    assert.ok(removed.zones.hand.some((card) => card.key === "ticket:personaShield:2"));
    assert.deepEqual(inventory(removed), inventory(before));
    assert.deepEqual(personaState(removed), { nextTicket: 3 });
    assert.equal(removed.zones.vanguard[0].power, before.zones.vanguard[0].power, "ticket use does not apply power automatically");
    assert.deepEqual(before, snapshot, "Undo retains the exact prior ticket and board state");
    assert.equal(removed.log.at(-1), "Removed Persona Shield.");
    assert.equal(removePersonaTicket(removed, "ticket:personaShield:1"), removed, "a spent ticket cannot be removed twice");
  }
});

test("manual ticket removal rejects physical cards, missing keys, and mulligan", () => {
  const session = addPersonaShieldTicket(ready());
  const physical = session.zones.hand.find((card) => !card.ticket)!;
  assert.equal(removePersonaTicket(session, physical.key), session);
  assert.equal(removePersonaTicket(session, "missing"), session);
  const mulligan = { ...session, phase: "mulligan" as const };
  assert.equal(removePersonaTicket(mulligan, "ticket:personaShield:1"), mulligan);
});

test("ticket serials persist through turn changes without storing defense context", () => {
  const before = addPersonaShieldTicket(ready());
  const opponent = apply(before, { ...before, active: "opponent", phase: "end" });
  const nextTurn = apply(opponent, nextPhase(opponent));
  assert.deepEqual(personaState(nextTurn), { nextTicket: 2 });
  assert.deepEqual(nextTurn.zones.hand.filter((card) => card.ticket), before.zones.hand.filter((card) => card.ticket));
  const added = addPersonaShieldTicket(nextTurn);
  assert.equal(added.zones.hand.at(-1)?.key, "ticket:personaShield:2");
  assert.deepEqual(personaState(added), { nextTicket: 3 });
});
