import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  beginCheck, canAttack, canDropCards, changeCards, changePower,
  finishMulligan, moveCards, nextPhase, startTable, ZONES,
  type CardChange, type TableSession, type Zone,
} from "../src/features/hand-lab/playtest.ts";
import {
  addPersonaShieldTicket, removePersonaTicket,
} from "../src/features/hand-lab/rules/persona.ts";

const entries = [
  { id: 1, card_id: 1, quantity: 10, zone: "main", card: { grade: 1 } },
  { id: 2, card_id: 2, quantity: 1, zone: "ride", card: { grade: 0 } },
  { id: 3, card_id: 3, quantity: 1, zone: "ride", card: { grade: 3 } },
] as DeckCardEntry[];

function game(active: "you" | "opponent" = "you"): TableSession {
  const session = finishMulligan(
    startTable(entries, true, "2:0", seededRandom(7)), [],
  );
  return addPersonaShieldTicket({ ...session, active });
}

function physicalKeys(session: TableSession) {
  return Object.values(session.zones).flat()
    .filter((card) => !card.ticket).map((card) => card.key).sort();
}

test("tickets cannot pay own-turn costs or enable partial mixed-card edits", () => {
  const session = game();
  const ticketKey = session.zones.hand.at(-1)!.key;
  const mixedKeys = [session.zones.hand[0].key, ticketKey];
  for (const zone of Object.keys(ZONES) as Zone[]) {
    assert.equal(moveCards(session, [ticketKey], zone), session);
    assert.equal(moveCards(session, mixedKeys, zone), session);
    assert.equal(canDropCards(session, [ticketKey], zone), false);
  }
  for (const action of ["rest", "flip", "critical+", "critical-", "power+2k"] as CardChange[]) {
    assert.equal(changeCards(session, mixedKeys, action), session);
  }
  assert.equal(changePower(session, mixedKeys, 5000), session);
});

test("opponent effects erase tickets without adding them to physical piles", () => {
  const session = game("opponent");
  const ticketKey = session.zones.hand.at(-1)!.key;
  for (const zone of ["drop", "bind", "soul", "deck", "damage", "reserve"] as Zone[]) {
    assert.equal(canDropCards(session, [ticketKey], zone), true);
    const next = moveCards(session, [ticketKey], zone);
    assert.equal(Object.values(next.zones).flat().some((card) => card.ticket), false);
    assert.deepEqual(physicalKeys(next), physicalKeys(session));
  }
  for (const zone of ["vanguard", "frontLeft", "guardian", "order"] as Zone[]) {
    assert.equal(canDropCards(session, [ticketKey], zone), false);
    assert.equal(moveCards(session, [ticketKey], zone), session);
  }
  assert.ok(session.zones.hand.some((card) => card.key === ticketKey), "Undo frame is intact");
});

test("manual ticket generation does not require an acquisition decision before attacks, checks, or advancing", () => {
  const session = { ...game(), phase: "battle" as const };
  const added = addPersonaShieldTicket(session);
  assert.equal(added.zones.hand.filter((card) => card.ticket).length, 2);
  assert.notEqual(nextPhase(added), added);
  assert.notEqual(beginCheck(added, "damage"), added);
  assert.equal(canAttack(added, added.zones.vanguard[0].key), true);
});

test("new ride cards stay hidden until used, while the starter enters face up", () => {
  const session = game();
  assert.equal(session.zones.ride[0].faceDown, true);
  assert.equal(session.zones.vanguard[0].faceDown, false);
  const ridden = moveCards(session, [session.zones.ride[0].key], "vanguard");
  assert.equal(ridden.zones.vanguard[0].faceDown, false);
});

test("ticket removal leaves manual unit power unchanged and normal turn cleanup still applies", () => {
  const session = game("opponent");
  const target = session.zones.vanguard[0].key;
  const powered = changePower(session, [target], 15000);
  const removed = removePersonaTicket(powered, "ticket:personaShield:1");
  assert.equal(removed.zones.vanguard[0].power, 15000);
  assert.equal(removed.zones.hand.some((card) => card.ticket), false);
  assert.deepEqual(physicalKeys(removed), physicalKeys(session));
  assert.equal(nextPhase(removed).zones.vanguard[0].power, 0);
  assert.equal(powered.zones.hand.at(-1)?.ticket, "personaShield", "Undo retains the ticket");
});
