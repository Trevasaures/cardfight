import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  beginCheck, changeCards, changeEnergy, finishMulligan, moveCards,
  nextPhase, resolveCheck, startTable, type TableSession,
} from "../src/features/hand-lab/playtest.ts";
import {
  applyRules, effectiveGrade, energyLimit, hasRuleToken, resolveXceed,
  ritualCount, setRuleToken,
} from "../src/features/hand-lab/rules/index.ts";

function entry(id: number, name: string, grade: number, quantity = 1, zone = "main", set = "") {
  return {
    id, card_id: id, quantity, zone,
    card: { name, grade, card_type: "Normal Unit", trigger_type: null },
    printing: { set_code: set },
  } as DeckCardEntry;
}
const list = [
  entry(1, "Grade one", 1, 10),
  { ...entry(2, "Critical", 0, 4), card: { ...entry(2, "Critical", 0).card!, card_type: "Trigger Unit", trigger_type: "Critical" } },
  entry(3, "Dragwizard, Morfessa", 2, 1, "main", "D-SS10"),
  entry(4, "Hellfire Dragon Emperor, Wirbel Kenig", 3, 1, "ride"),
  entry(5, "Hellfire Dragon, Wirbel Dragon", 3),
  entry(6, "Starter", 0, 1, "ride"),
  entry(7, "G unit", 4, 2, "g"),
  entry(8, "Energy Generator", 0, 1, "token"),
  entry(9, "SYSTEM CODE: X-ceed", 1, 1, "token"),
  entry(10, "Dragwizard, Morfessa", 2, 1, "main", "G-BT09"),
];
const entries = new Map(list.map((entry) => [entry.id, entry]));
const context = (session: TableSession) => ({ session, entries });
const apply = (before: TableSession, after: TableSession) => applyRules(before, after, entries);
const ready = () => finishMulligan(startTable(list, false, "6:0", seededRandom(3)), []);
const inventory = (session: TableSession) => Object.values(session.zones).flat().map((card) => card.key).sort();

function xceedGame() {
  let session = setRuleToken(ready(), "xceed", true);
  session = moveCards(session, ["1:0", "1:1", "1:2", "1:3", "1:4"], "drop");
  return session;
}

function damage(session: TableSession, key: string) {
  const checked = beginCheck(moveCards(session, [key], "deck", "top"), "damage");
  return apply(checked, resolveCheck(checked));
}

test("Kenig requires VC and Energy Generator; losing either restores the normal cap", () => {
  let session = ready();
  assert.equal(energyLimit(context(session)), 10);
  session = moveCards(session, ["4:0"], "vanguard");
  assert.equal(energyLimit(context(session)), 10);
  session = setRuleToken(session, "energyGenerator", true);
  assert.equal(energyLimit(context(session)), 15);
  session = apply(session, changeEnergy(session, 20, energyLimit(context(session))));
  assert.equal(session.energy, 15);
  const moved = apply(session, moveCards(session, ["4:0"], "bind"));
  assert.equal(moved.energy, 10);
  assert.equal(session.energy, 15, "prior snapshot remains intact for undo");
  const removed = apply(session, setRuleToken(session, "energyGenerator", false));
  assert.equal(removed.energy, 10);
  session = moveCards(session, ["5:0"], "vanguard");
  assert.equal(energyLimit(context(session)), 10, "original Wirbel has no extension");
});

test("printed tokens activate only in their proper zones and do not need virtual copies", () => {
  let session = ready();
  assert.equal(hasRuleToken(context(session), "xceed"), false);
  session = moveCards(session, ["9:0"], "order");
  assert.equal(hasRuleToken(context(session), "xceed"), true);
  session = moveCards(session, ["8:0"], "crest");
  session = moveCards(session, ["4:0"], "vanguard");
  assert.equal(energyLimit(context(session)), 15);
  session = changeCards(session, ["8:0"], "flip");
  assert.equal(energyLimit(context(session)), 10);
});

test("Ritual uses physical grade-one copies and printing-specific Morfessa conditions", () => {
  let session = moveCards(ready(), ["1:0", "1:1", "3:0", "10:0"], "drop");
  assert.equal(ritualCount(context(session)), 3);
  const standard = session.zones.drop.find((card) => card.entryId === 3)!;
  assert.equal(effectiveGrade(context(session), standard, "drop"), 1);
  assert.equal(effectiveGrade(context(session), standard, "hand"), 2);
  session = changeCards(session, ["7:0"], "flip");
  assert.equal(ritualCount(context(session)), 4, "original Morfessa needs GB1");
  session = moveCards(session, ["3:0"], "hand");
  assert.equal(ritualCount(context(session)), 3);
  assert.equal(entries.get(3)!.card!.grade, 2, "printed data is untouched");
  const unknown = new Map(entries);
  unknown.set(10, { ...entries.get(10)!, printing: null });
  assert.equal(ritualCount({ session, entries: unknown }), 2);
});

test("X-ceed moves the chosen drop copy and adds defensive power once per normal damage", () => {
  const before = xceedGame();
  const pending = damage(before, "1:8");
  assert.equal(pending.rules.pending.length, 1);
  assert.equal(pending.zones.vanguard[0].power, 0, "wait for the choice");
  assert.equal(nextPhase(pending), pending);
  assert.equal(beginCheck(pending, "damage"), pending);
  assert.equal(resolveXceed(context(pending), "missing"), pending);
  assert.equal(resolveXceed(context(pending), null), pending, "cannot skip an available drop");
  const resolved = apply(pending, resolveXceed(context(pending), "1:2"));
  assert.equal(resolved.zones.gauge[0].key, "1:2");
  assert.equal(resolved.zones.gauge[0].faceDown, false);
  assert.equal(resolved.zones.vanguard[0].power, 5000);
  assert.equal(resolved.rules.pending.length, 0);
  assert.equal(resolveXceed(context(resolved), "1:0"), resolved);
  assert.deepEqual(inventory(resolved), inventory(before));
  assert.equal(nextPhase(resolved).zones.vanguard[0].power, 0);
});

test("X-ceed evaluates the new gauge count; trigger power stays manual and four gauges are not a passive", () => {
  let session = xceedGame();
  session = moveCards(session, ["1:0", "1:1"], "gauge");
  let pending = damage(session, "2:0");
  session = resolveXceed(context(pending), "1:2");
  assert.equal(session.zones.gauge.length, 3);
  assert.equal(session.zones.vanguard[0].power, 0);
  pending = damage(session, "2:1");
  pending = changeCards(pending, ["6:0"], "power+");
  session = resolveXceed(context(pending), "1:3");
  assert.equal(session.zones.gauge.length, 4);
  assert.equal(session.zones.vanguard[0].power, 10000, "manual power plus X-ceed's 5k");
  session = nextPhase(session);
  assert.equal(session.zones.vanguard[0].power, 0, "no permanent threshold bonus");
  assert.equal(session.zones.gauge.length, 4);
});

test("only damage arrivals on the opponent turn queue effects; flips and manual placements stay distinct", () => {
  let session = xceedGame();
  let after = apply(session, moveCards(session, ["1:8", "2:0"], "damage"));
  assert.equal(after.rules.pending.length, 2);
  assert.ok(after.rules.pending.every((choice) => !choice.nonTriggerDamageCheck));
  session = resolveXceed(context(after), "1:0");
  session = resolveXceed(context(session), "1:1");
  assert.equal(session.zones.vanguard[0].power, 0, "no damage check was performed");
  after = apply(session, changeCards(session, ["1:8"], "flip"));
  assert.equal(after.rules.pending.length, 0);
  session = nextPhase(after);
  after = apply(session, moveCards(session, ["1:9"], "damage"));
  assert.equal(after.rules.pending.length, 0, "own-turn damage does not trigger X-ceed");
  session = ready();
  assert.equal(damage(session, "1:8").rules.pending.length, 0, "token must be in play");
});

test("empty-drop resolution still evaluates X-ceed power without inventing a gauge", () => {
  let session = setRuleToken(ready(), "xceed", true);
  session = damage(session, "1:8");
  session = resolveXceed(context(session), null);
  assert.equal(session.zones.vanguard[0].power, 5000);
  assert.equal(session.zones.gauge.length, 0);
  assert.equal(session.rules.pending.length, 0);
});
