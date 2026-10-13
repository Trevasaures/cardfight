import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import { crestViews } from "../src/features/hand-lab/crests.ts";
import {
  beginCheck,
  changeCards,
  changeEnergy,
  finishMulligan,
  moveCards,
  nextPhase,
  resolveCheck,
  startTable,
  type TableSession,
} from "../src/features/hand-lab/playtest.ts";
import {
  applyRules,
  energyLimit,
  hasRuleToken,
  resolveXceed,
  setRuleToken,
} from "../src/features/hand-lab/rules/index.ts";
import {
  ruleVisibility,
  supportsImpauldio,
} from "../src/features/hand-lab/rules/visibility.ts";

function entry(
  id: number,
  name: string,
  grade: number | null,
  zone = "ride",
  cardType = "Normal Unit",
  quantity = 1,
) {
  return {
    id,
    card_id: id,
    quantity,
    zone,
    card: { name, grade, card_type: cardType },
  } as DeckCardEntry;
}

const units = [
  entry(1, "Starter", 0),
  entry(2, "First ride", 1),
  entry(3, "Second ride", 2),
  entry(4, "Third ride", 3),
  entry(5, "Main unit", 1, "main", "Normal Unit", 10),
];
const generator = entry(6, "Energy Generator", null, "crest", "Ride Deck Crest");
const inno = entry(2, "  Inno   Progrett  ", 1);
const impauldio = entry(4, "Gigant Arms, Silhouette Impauldio", 3);
const xceed = entry(7, "SYSTEM CODE: X-ceed", 1, "token", "Set Order");
const impauldioDeck = [units[0], inno, units[2], impauldio, units[4]];

const context = (session: TableSession, list: DeckCardEntry[]) => ({
  session,
  entries: new Map(list.map((item) => [item.id, item])),
});
const apply = (
  before: TableSession,
  after: TableSession,
  list: DeckCardEntry[],
) => applyRules(before, after, context(before, list).entries);
const inventory = (session: TableSession) =>
  Object.values(session.zones).flat().map((card) => card.key).sort();

function ready(list = units, first = true) {
  return finishMulligan(
    startTable(list, first, "1:0", seededRandom(7)),
    [],
  );
}

function ridePhase(list = units, first = true) {
  let session = ready(list, first);
  if (!first) session = apply(session, nextPhase(session), list);
  session = apply(session, nextPhase(session), list);
  return apply(session, nextPhase(session), list);
}

test("rule visibility follows deck identity rather than unrelated saved tokens or gauges", () => {
  let session = setRuleToken(ready(units, false), "xceed", true);
  session = moveCards(session, ["5:0"], "gauge");
  assert.deepEqual(ruleVisibility(context(session, units)), {
    ritual: false,
    impauldio: false,
    pendingXceed: false,
  });
  const checked = beginCheck(session, "damage");
  const after = apply(checked, resolveCheck(checked), units);
  assert.equal(after.rules.pending.length, 0);
  assert.equal(after.zones.vanguard[0].power, 0);
  assert.equal(after.rules.tokens.xceed, true, "legacy flags are preserved");
  assert.deepEqual(after.zones.gauge, session.zones.gauge);
  assert.equal(supportsImpauldio(context(session, impauldioDeck)), true);
  assert.equal(supportsImpauldio(context(session, [...units, xceed])), true);
  const luard = [...units, entry(8, "Dragheart, Luard", 3, "main")];
  assert.equal(ruleVisibility(context(session, luard)).ritual, true);
  assert.equal(ruleVisibility(context(session, luard)).impauldio, false);
});

test("legacy pending X-ceed remains resolvable without exposing unrelated setup controls", () => {
  const before = moveCards(ready(units, false), ["5:0"], "drop");
  const session: TableSession = {
    ...before,
    rules: {
      ...before.rules,
      pending: [{ rule: "xceed", nonTriggerDamageCheck: false }],
    },
  };
  assert.deepEqual(ruleVisibility(context(session, units)), {
    ritual: false,
    impauldio: false,
    pendingXceed: true,
  });
  const resolved = resolveXceed(context(session, units), "5:0");
  assert.equal(resolved.rules.pending.length, 0);
  assert.equal(resolved.zones.gauge[0].key, "5:0");
  assert.deepEqual(inventory(resolved), inventory(session));
});

test("the first normal ride activates a virtual generator and charges only the second player", () => {
  for (const first of [true, false]) {
    const before = ridePhase(units, first);
    const snapshot = structuredClone(before);
    const after = apply(before, moveCards(before, ["2:0"], "vanguard"), units);
    assert.equal(hasRuleToken(context(after, units), "energyGenerator"), true);
    assert.equal(after.energy, first ? 0 : 3);
    assert.deepEqual(inventory(after), inventory(before));
    assert.deepEqual(before, snapshot, "activation belongs to the new undo frame");
    assert.equal(apply(after, after, units), after, "a no-op never replays effects");
  }
});

test("a physical generator is placed from reserve once without duplicating inventory or its tile", () => {
  const list = [...units, generator];
  const before = ridePhase(list, false);
  const after = apply(before, moveCards(before, ["2:0"], "vanguard"), list);
  assert.equal(after.zones.reserve.length, 0);
  assert.equal(after.zones.crest[0].key, "6:0");
  assert.equal(after.rules.tokens.energyGenerator, false);
  assert.equal(after.energy, 3);
  assert.deepEqual(inventory(after), inventory(before));
  const views = crestViews(context(after, list));
  assert.equal(views.length, 1);
  assert.equal(views[0].virtual, false);
  assert.equal(views[0].active, true);
  const nextRide = apply(after, moveCards(after, ["3:0"], "vanguard"), list);
  assert.equal(nextRide.energy, 3, "placement is not triggered by later rides");
  assert.equal(nextRide.zones.crest.length, 1);
});

test("an active generator charges at the beginning of each own ride phase and respects the cap", () => {
  const before = setRuleToken(ready(), "energyGenerator", true);
  const draw = apply(before, nextPhase(before), units);
  const ride = apply(draw, nextPhase(draw), units);
  assert.equal(ride.energy, 3);
  const moved = apply(ride, moveCards(ride, ["2:0"], "vanguard"), units);
  assert.equal(moved.energy, 3, "ride and phase entry cannot charge twice");
  assert.equal(apply(moved, nextPhase(moved), units).energy, 3);
  const nearlyFull = changeEnergy(draw, 9);
  assert.equal(apply(nearlyFull, nextPhase(nearlyFull), units).energy, 10);
  const opponent = { ...draw, active: "opponent" as const };
  assert.equal(apply(opponent, { ...opponent, phase: "ride" }, units).energy, 0);
  const inactive = ready();
  const inactiveDraw = apply(inactive, nextPhase(inactive), units);
  assert.equal(apply(inactiveDraw, nextPhase(inactiveDraw), units).energy, 0);
});

test("generator charging respects Kenig's conditional fifteen-energy limit", () => {
  const kenig = entry(4, "Hellfire Dragon Emperor, Wirbel Kenig", 3);
  const list = [units[0], units[1], units[2], kenig, units[4]];
  let session = setRuleToken(ready(list), "energyGenerator", true);
  session = moveCards(session, ["4:0"], "vanguard");
  session = { ...session, phase: "draw" };
  session = changeEnergy(session, 14, energyLimit(context(session, list)));
  const after = apply(session, nextPhase(session), list);
  assert.equal(after.energy, 15);
  const lost = apply(after, moveCards(after, ["4:0"], "bind"), list);
  assert.equal(lost.energy, 10);
  assert.equal(after.energy, 15);
});

test("calls, soul promotion, hidden cards and orders never masquerade as generator-activating rides", () => {
  const before = ridePhase();
  for (const phase of ["main", "battle"] as const) {
    const called = { ...before, phase };
    const after = apply(called, moveCards(called, ["2:0"], "vanguard"), units);
    assert.equal(after.rules.tokens.energyGenerator, false, phase);
  }
  const fromSoul = moveCards(before, ["2:0"], "soul");
  assert.equal(
    apply(fromSoul, moveCards(fromSoul, ["2:0"], "vanguard"), units)
      .rules.tokens.energyGenerator,
    false,
  );
  const hiddenStarter = changeCards(before, ["1:0"], "flip");
  assert.equal(
    apply(hiddenStarter, moveCards(hiddenStarter, ["2:0"], "vanguard"), units)
      .rules.tokens.energyGenerator,
    false,
  );
  const order = entry(2, "Normal Order", 1, "ride", "Normal Order");
  const list = [units[0], order, ...units.slice(2)];
  const orderGame = ridePhase(list);
  assert.equal(
    apply(orderGame, moveCards(orderGame, ["2:0"], "vanguard"), list)
      .rules.tokens.energyGenerator,
    false,
  );
});

test("manual generator removal is preserved on later virtual rides and physical flipped crests", () => {
  const before = ridePhase();
  const firstRide = apply(before, moveCards(before, ["2:0"], "vanguard"), units);
  const removed = setRuleToken(firstRide, "energyGenerator", false);
  const laterRide = apply(removed, moveCards(removed, ["3:0"], "vanguard"), units);
  assert.equal(laterRide.rules.tokens.energyGenerator, false);
  const list = [...units, generator];
  let physical = ridePhase(list);
  physical = apply(physical, moveCards(physical, ["2:0"], "vanguard"), list);
  physical = changeCards(physical, ["6:0"], "flip");
  const after = apply(physical, moveCards(physical, ["3:0"], "vanguard"), list);
  assert.equal(after.zones.crest[0].faceDown, true);
  assert.equal(hasRuleToken(context(after, list), "energyGenerator"), false);
});

test("original Inno reveals a grade-three Impauldio in the ride deck and gains virtual X-ceed once", () => {
  const before = ridePhase(impauldioDeck, false);
  const after = apply(before, moveCards(before, ["2:0"], "vanguard"), impauldioDeck);
  assert.equal(after.rules.tokens.xceed, true);
  assert.equal(after.energy, 3, "Generator placement resolves in the same snapshot");
  assert.deepEqual(after.zones.ride.find((card) => card.key === "4:0"), before.zones.ride[2]);
  assert.deepEqual(inventory(after), inventory(before));
  assert.equal(before.rules.tokens.xceed, false);
  assert.equal(after.log.filter((message) => /revealed .*Impauldio/.test(message)).length, 1);
  const later = apply(after, changeEnergy(after, 1), impauldioDeck);
  assert.equal(later.log.filter((message) => /revealed .*Impauldio/.test(message)).length, 1);
});

test("original Inno uses the physical X-ceed token without inventing or mutating cards", () => {
  const list = [...impauldioDeck, xceed, generator];
  const before = ridePhase(list);
  const after = apply(before, moveCards(before, ["2:0"], "vanguard"), list);
  assert.equal(after.rules.tokens.xceed, false);
  assert.equal(after.zones.token.length, 0);
  assert.equal(after.zones.order[0].key, "7:0");
  assert.equal(hasRuleToken(context(after, list), "xceed"), true);
  assert.deepEqual(inventory(after), inventory(before));
  assert.equal(before.zones.token[0].key, "7:0");
  assert.equal(after.zones.ride.find((card) => card.key === "4:0")?.faceDown, false);
});

test("Inno acquisition requires the exact original, grade-zero ride and eligible ride-deck reveal", () => {
  const variants = [
    [units[0], entry(2, "X-CeeDaNCe, Inno Progrett", 1), units[2], impauldio, units[4]],
    [units[0], inno, units[2], entry(4, "Impauldio", 2), units[4]],
    [units[0], inno, units[2], entry(4, "Impauldio", 3, "main"), units[4]],
    [units[0], inno, units[2], units[3], units[4]],
  ];
  for (const list of variants) {
    const before = ridePhase(list);
    const after = apply(before, moveCards(before, ["2:0"], "vanguard"), list);
    assert.equal(after.rules.tokens.xceed, false);
    assert.ok(!after.log.some((message) => message.includes("revealed")));
  }
  let before = ridePhase(impauldioDeck);
  before = moveCards(before, ["3:0"], "vanguard");
  assert.equal(
    apply(before, moveCards(before, ["2:0"], "vanguard"), impauldioDeck)
      .rules.tokens.xceed,
    false,
  );
  const main = { ...ridePhase(impauldioDeck), phase: "main" as const };
  assert.equal(
    apply(main, moveCards(main, ["2:0"], "vanguard"), impauldioDeck)
      .rules.tokens.xceed,
    false,
  );
  assert.equal(setRuleToken(main, "xceed", true).rules.tokens.xceed, true);
});

test("a misplaced type-marked X-ceed crest cannot be silently lost to unsupported auto acquisition", () => {
  const invalidToken = entry(7, "SYSTEM CODE: X-ceed", null, "crest", "Crest");
  const list = [...impauldioDeck, invalidToken];
  const before = ridePhase(list);
  const after = apply(before, moveCards(before, ["2:0"], "vanguard"), list);
  assert.equal(after.rules.tokens.xceed, false);
  assert.equal(after.zones.reserve[0].key, "7:0");
  assert.ok(!after.log.some((message) => message.includes("gained X-ceed")));
  assert.deepEqual(inventory(after), inventory(before));
});
