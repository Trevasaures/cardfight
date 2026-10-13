import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry, DeckVersion } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  attackCard,
  beginCheck,
  canDropCards,
  changeCards,
  changePower,
  finishMulligan,
  listCopies,
  moveCards,
  nextPhase,
  resolveCheck,
  startTable,
  takeTop,
  type TableSession,
} from "../src/features/hand-lab/playtest.ts";
import {
  canStride,
  canDropInGZone,
  canTurnFaceUpGUnits,
  generationBreak,
  dropInGZone,
  heartCard,
  isGUnit,
  soulCards,
  stride,
  turnFaceUpGUnits,
} from "../src/features/hand-lab/stride.ts";
import { effectiveGrade } from "../src/features/hand-lab/rules/luard.ts";
import {
  createPlaytestStore,
  PLAYTEST_STORAGE_KEY,
  playtestSource,
} from "../src/features/hand-lab/sessionStore.ts";

const entries = [
  {
    id: 1,
    card_id: 1,
    quantity: 10,
    zone: "main",
    card: {
      name: "Normal unit",
      grade: 1,
      card_type: "Normal Unit",
      power: 8000,
    },
  },
  {
    id: 2,
    card_id: 2,
    quantity: 1,
    zone: "ride",
    card: { name: "Starter", grade: 0, card_type: "Normal Unit", power: 6000 },
  },
  {
    id: 3,
    card_id: 3,
    quantity: 1,
    zone: "ride",
    card: {
      name: "Nightrose",
      grade: 3,
      card_type: "Normal Unit",
      power: 11000,
    },
  },
  {
    id: 20,
    card_id: 20,
    quantity: 3,
    zone: "g",
    card: { name: "G unit", grade: 4, card_type: "G Unit", power: 15000 },
  },
  {
    id: 21,
    card_id: 21,
    quantity: 1,
    zone: "g",
    card: {
      name: "Not a G unit",
      grade: 4,
      card_type: "Normal Unit",
      power: 15000,
    },
  },
  {
    id: 22,
    card_id: 22,
    quantity: 1,
    zone: "crest",
    card: { name: "Nightrose Crest", grade: null, card_type: "Crest" },
  },
] as DeckCardEntry[];
const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
const context = (session: TableSession) => ({ session, entries: entryMap });
function rideReady() {
  let session = finishMulligan(
    startTable(entries, false, "2:0", seededRandom(3)),
    [],
  );
  session = nextPhase(nextPhase(nextPhase(session)));
  return moveCards(session, ["3:0"], "vanguard");
}
const inventory = (session: TableSession) =>
  Object.values(session.zones)
    .flat()
    .map((card) => card.key)
    .sort();

test("manual stride requires a G-zone unit, a normal grade3+ heart and a clear own Ride or Main phase", () => {
  const valid = rideReady();
  assert.equal(valid.phase, "ride");
  assert.equal(canStride(context(valid), "20:0"), true);
  for (const invalid of [
    { ...valid, phase: "stand" as const },
    { ...valid, phase: "draw" as const },
    { ...valid, phase: "battle" as const },
    { ...valid, phase: "end" as const },
    { ...valid, active: "opponent" as const },
    beginCheck(valid, "damage"),
    {
      ...valid,
      rules: {
        ...valid.rules,
        pending: [{ rule: "xceed" as const, nonTriggerDamageCheck: true }],
      },
    },
    changeCards(valid, ["3:0"], "flip"),
    moveCards(valid, ["3:0"], "drop"),
    stride(context(valid), "20:1"),
  ]) {
    assert.equal(canStride(context(invalid), "20:0"), false);
    assert.equal(stride(context(invalid), "20:0"), invalid);
  }
  for (const key of ["missing", "21:0", "22:0", valid.zones.hand[0].key]) {
    assert.equal(stride(context(valid), key), valid);
  }
});

test("manual recovery strides face-up or face-down G copies in Ride and Main without duplicating the heart", () => {
  for (const phase of ["ride", "main"] as const) {
    for (const faceUp of [false, true]) {
      let before = { ...rideReady(), phase };
      if (faceUp) {
        before = turnFaceUpGUnits(context(before), ["20:0", "20:1", "20:2"]);
      }
      const countBefore = generationBreak(context(before)).total;
      assert.equal(canStride(context(before), "20:0"), true);
      const active = stride(context(before), "20:0");
      assert.equal(active.zones.vanguard[0].key, "20:0");
      assert.equal(
        active.zones.g.some((card) => card.key === "20:0"),
        false,
      );
      assert.equal(heartCard(context(active))?.key, "3:0");
      assert.equal(
        active.zones.soul.filter((card) => card.key === "3:0").length,
        1,
      );
      assert.equal(active.zones.vanguard[0].power, 11000);
      assert.equal(
        generationBreak(context(active)).total,
        countBefore + Number(!faceUp),
      );
      assert.equal(stride(context(active), "20:0"), active);
      assert.equal(
        stride(context(active), "20:1"),
        active,
        "an active stride blocks a second heart association",
      );
      assert.deepEqual(inventory(active), inventory(before));
      assert.equal(
        before.zones.vanguard[0].key,
        "3:0",
        "Undo source stays intact",
      );

      let end = active;
      while (end.phase !== "end") end = nextPhase(end);
      assert.equal(end.zones.vanguard[0].key, "3:0");
      assert.equal(end.zones.g.filter((card) => card.key === "20:0").length, 1);
      assert.equal(
        end.zones.g.find((card) => card.key === "20:0")?.faceDown,
        false,
      );
      assert.deepEqual(inventory(end), inventory(before));
    }
  }
});

test("stride keeps one linked heart beneath the G unit, inherits printed power and preserves physical inventory", () => {
  let before = rideReady();
  before = changePower(before, ["3:0"], 2000);
  before = changeCards(before, ["3:0"], "rest");
  const after = stride(context(before), "20:0");
  const unit = after.zones.vanguard[0];
  assert.deepEqual(after.stride, { gUnitKey: "20:0", heartKey: "3:0" });
  assert.equal(unit.gUnit, true);
  assert.equal(unit.faceDown, false);
  assert.equal(unit.rested, true, "stride inherits the heart's orientation");
  assert.equal(unit.power, 11000, "temporary heart bonuses are not inherited");
  assert.equal(
    (entryMap.get(unit.entryId)?.card?.power ?? 0) + unit.power,
    26000,
  );
  assert.equal(heartCard(context(after))?.key, "3:0");
  assert.equal(after.zones.soul.at(-1)?.key, "3:0");
  assert.deepEqual(
    soulCards(after).map((card) => card.key),
    ["2:0"],
  );
  assert.equal(before.zones.vanguard[0].key, "3:0");
  assert.equal(before.zones.vanguard[0].power, 2000);
  assert.deepEqual(inventory(after), inventory(before));
});

test("linked hearts cannot be soul blasted, moved with a group, flipped or given unit bonuses", () => {
  const session = stride(context(rideReady()), "20:0");
  assert.equal(canDropCards(session, ["3:0"], "drop"), false);
  assert.equal(moveCards(session, ["2:0", "3:0"], "drop"), session);
  assert.equal(changeCards(session, ["3:0"], "flip"), session);
  assert.equal(changeCards(session, ["3:0"], "rest"), session);
  assert.equal(changePower(session, ["20:0", "3:0"], 5000), session);
  const blasted = moveCards(session, ["2:0"], "drop");
  assert.equal(blasted.zones.drop[0].key, "2:0");
  assert.equal(heartCard(context(blasted))?.key, "3:0");
  assert.deepEqual(soulCards(blasted), []);
});

test("face-up G costs are explicit, atomic and idempotent, and GB counts only actual G units in G or Vanguard", () => {
  let session = rideReady();
  assert.deepEqual(generationBreak(context(session)), {
    gFaceUp: 0,
    vanguardG: 0,
    total: 0,
  });
  session = changeCards(session, ["21:0"], "flip");
  session = moveCards(session, ["22:0"], "crest");
  assert.equal(generationBreak(context(session)).total, 0);
  for (const keys of [
    [],
    ["missing"],
    ["21:0"],
    ["20:0", "21:0"],
    ["20:0", session.zones.hand[0].key],
  ]) {
    assert.equal(canTurnFaceUpGUnits(context(session), keys), false);
    assert.equal(turnFaceUpGUnits(context(session), keys), session);
  }
  const paid = turnFaceUpGUnits(context(session), ["20:1", "20:1"]);
  assert.equal(generationBreak(context(paid)).gFaceUp, 1);
  assert.equal(turnFaceUpGUnits(context(paid), ["20:1"]), paid);
  const active = stride(context(paid), "20:0");
  assert.deepEqual(generationBreak(context(active)), {
    gFaceUp: 1,
    vanguardG: 1,
    total: 2,
  });
  const soulG = moveCards(active, ["20:2"], "soul");
  assert.equal(
    generationBreak(context(soulG)).total,
    2,
    "G units in soul do not count",
  );
  assert.deepEqual(inventory(soulG), inventory(session));
});

test("dropping a G-zone card into the physical G area flips it in place without changing order or other copies", () => {
  const before = rideReady();
  const saved = JSON.stringify(before);
  assert.equal(
    canDropCards(before, ["20:1"], "g"),
    false,
    "generic movement stays a same-zone no-op",
  );
  assert.equal(canDropInGZone(context(before), ["20:1", "20:1"]), true);
  const after = dropInGZone(context(before), ["20:1", "20:1"]);
  assert.deepEqual(
    after.zones.g.map((card) => card.key),
    before.zones.g.map((card) => card.key),
  );
  assert.equal(
    after.zones.g.find((card) => card.key === "20:1")?.faceDown,
    false,
  );
  assert.equal(
    after.zones.g.find((card) => card.key === "20:0")?.faceDown,
    true,
  );
  assert.equal(
    after.zones.g.find((card) => card.key === "20:2")?.faceDown,
    true,
  );
  assert.deepEqual(generationBreak(context(after)), {
    gFaceUp: 1,
    vanguardG: 0,
    total: 1,
  });
  assert.equal(canDropInGZone(context(after), ["20:1"]), false);
  assert.equal(
    dropInGZone(context(after), ["20:1"]),
    after,
    "used cards never toggle down",
  );
  assert.equal(
    JSON.stringify(before),
    saved,
    "Undo keeps the previous face-down cost copy",
  );
  assert.deepEqual(inventory(after), inventory(before));
});

test("dropping only the active stride into G restores its own heart and leaves cost copies unchanged", () => {
  let before = stride(context(rideReady()), "20:0");
  before = takeTop(before, "soul");
  before = changeCards(before, ["20:0"], "rest");
  const actualSoul = soulCards(before);
  const saved = JSON.stringify(before);
  assert.equal(canDropInGZone(context(before), ["20:0"]), true);
  const after = dropInGZone(context(before), ["20:0"]);
  assert.equal(after.stride, null);
  assert.equal(after.zones.vanguard[0].key, "3:0");
  assert.equal(after.zones.vanguard[0].rested, true);
  assert.deepEqual(soulCards(after), actualSoul);
  assert.equal(
    after.zones.g.find((card) => card.key === "20:0")?.faceDown,
    false,
  );
  assert.equal(
    after.zones.g.find((card) => card.key === "20:1")?.faceDown,
    true,
  );
  assert.equal(
    after.zones.g.find((card) => card.key === "20:2")?.faceDown,
    true,
  );
  assert.deepEqual(generationBreak(context(after)), {
    gFaceUp: 1,
    vanguardG: 0,
    total: 1,
  });
  assert.equal(after.zones.g.filter((card) => card.key === "20:0").length, 1);
  assert.deepEqual(inventory(after), inventory(before));
  assert.equal(
    JSON.stringify(before),
    saved,
    "Undo retains the active G unit and linked heart",
  );
  assert.equal(heartCard(context(before))?.key, "3:0");
});

test("G-area drops validate the whole group and cannot prematurely return a stride during checks or queued effects", () => {
  const before = stride(context(rideReady()), "20:0");
  for (const keys of [
    [],
    ["missing"],
    ["20:1", "missing"],
    ["20:1", "21:0"],
    ["20:1", "22:0"],
    ["20:1", "3:0"],
    ["20:0", "20:1"],
    ["20:1", before.zones.hand[0].key],
  ]) {
    assert.equal(canDropInGZone(context(before), keys), false);
    assert.equal(dropInGZone(context(before), keys), before);
  }
  const battle = nextPhase(nextPhase(before));
  const pending = beginCheck(battle, "drive");
  const rulesPending = {
    ...battle,
    rules: {
      ...battle.rules,
      pending: [{ rule: "xceed" as const, nonTriggerDamageCheck: false }],
    },
  };
  for (const blocked of [
    pending,
    rulesPending,
    { ...battle, active: "opponent" as const },
  ]) {
    assert.equal(canDropInGZone(context(blocked), ["20:0", "20:1"]), false);
    assert.equal(dropInGZone(context(blocked), ["20:0", "20:1"]), blocked);
  }
  assert.equal(
    canDropInGZone(context(pending), ["20:1"]),
    true,
    "a manual cost flip does not resolve or interrupt the check",
  );
  const paid = dropInGZone(context(pending), ["20:1"]);
  assert.deepEqual(paid.check, pending.check);
  assert.equal(paid.zones.vanguard[0].key, "20:0");
  assert.equal(
    paid.zones.g.find((card) => card.key === "20:1")?.faceDown,
    false,
  );
});

test("G units cannot enter Crest, but a legacy misplaced G unit can recover into G", () => {
  const before = rideReady();
  const ordinary = before.zones.hand[0].key;
  assert.equal(canDropCards(before, ["20:0"], "crest"), false);
  assert.equal(moveCards(before, ["20:0"], "crest"), before);
  assert.equal(
    moveCards(before, [ordinary, "20:0"], "crest"),
    before,
    "mixed moves stay atomic",
  );
  assert.equal(
    canDropCards(before, [ordinary], "crest"),
    true,
    "general manual movement is unchanged",
  );
  const misplaced = before.zones.g.find((card) => card.key === "20:0")!;
  const legacy = {
    ...before,
    zones: {
      ...before.zones,
      g: before.zones.g.filter((card) => card.key !== misplaced.key),
      crest: [...before.zones.crest, misplaced],
    },
  };
  assert.equal(canDropCards(legacy, [misplaced.key], "g"), true);
  const recovered = moveCards(legacy, [misplaced.key], "g");
  assert.equal(recovered.zones.crest.length, 0);
  assert.equal(
    recovered.zones.g.find((card) => card.key === misplaced.key)?.faceDown,
    false,
  );
  assert.deepEqual(inventory(recovered), inventory(before));
});

test("start of End returns the striding unit face up and restores its heart in the same orientation", () => {
  const before = rideReady();
  let session = stride(context(before), "20:0");
  session = turnFaceUpGUnits(context(session), ["20:1"]);
  session = nextPhase(nextPhase(session));
  session = attackCard(session, "20:0");
  session = changePower(session, ["20:0"], 10000);
  const pending = beginCheck(session, "drive");
  assert.equal(nextPhase(pending), pending, "unresolved checks block End");
  const rulesPending = {
    ...session,
    rules: {
      ...session.rules,
      pending: [{ rule: "xceed" as const, nonTriggerDamageCheck: false }],
    },
  };
  assert.equal(
    nextPhase(rulesPending),
    rulesPending,
    "queued effects block End",
  );
  const end = nextPhase(resolveCheck(pending));
  assert.equal(end.phase, "end");
  assert.equal(end.active, "you");
  assert.equal(end.stride, null);
  assert.equal(end.zones.vanguard[0].key, "3:0");
  assert.equal(end.zones.vanguard[0].rested, true);
  assert.equal(end.zones.vanguard[0].power, 0);
  const returned = end.zones.g.find((card) => card.key === "20:0")!;
  assert.equal(returned.faceDown, false);
  assert.equal(returned.rested, false);
  assert.equal(returned.power, 0);
  assert.equal(end.attackerKey, null);
  assert.deepEqual(
    soulCards(end).map((card) => card.key),
    ["2:0"],
  );
  assert.deepEqual(generationBreak(context(end)), {
    gFaceUp: 2,
    vanguardG: 0,
    total: 2,
  });
  const nextTurn = nextPhase(nextPhase(end));
  assert.equal(nextTurn.zones.vanguard[0].rested, false);
  assert.deepEqual(inventory(end), inventory(before));
});

test("manual G-vanguard removal and ordinary rides restore the heart without putting G units in drop or soul", () => {
  const active = stride(context(rideReady()), "20:0");
  const removed = moveCards(active, ["20:0"], "bind");
  assert.equal(removed.zones.bind.length, 0);
  assert.equal(removed.zones.vanguard[0].key, "3:0");
  assert.equal(
    removed.zones.g.find((card) => card.key === "20:0")?.faceDown,
    false,
  );
  assert.equal(removed.stride, null);
  const normal = active.zones.hand[0];
  const ridden = moveCards(active, [normal.key], "vanguard");
  assert.equal(ridden.zones.vanguard[0].key, normal.key);
  assert.equal(ridden.zones.soul.at(-1)?.key, "3:0");
  assert.ok(!ridden.zones.soul.some((card) => card.gUnit));
  assert.equal(
    ridden.zones.g.find((card) => card.key === "20:0")?.faceDown,
    false,
  );
  assert.deepEqual(inventory(ridden), inventory(active));
});

test("legacy manual G-vanguard records return conservatively, including End snapshots and empty hearts", () => {
  const before = rideReady();
  const manuallyMoved = moveCards(before, ["20:0"], "vanguard");
  const legacy = { ...manuallyMoved, phase: "battle" as const };
  delete legacy.stride;
  assert.equal(heartCard(context(legacy))?.key, "3:0");
  assert.equal(nextPhase(legacy).zones.vanguard[0].key, "3:0");
  const alreadyEnd = nextPhase({ ...legacy, phase: "end" });
  assert.equal(alreadyEnd.zones.vanguard[0].key, "3:0");
  assert.equal(alreadyEnd.active, "opponent");

  let empty = finishMulligan(
    startTable(entries, true, null, seededRandom(3)),
    [],
  );
  empty = moveCards(empty, ["20:0"], "vanguard");
  const returned = nextPhase({ ...empty, phase: "battle" });
  assert.equal(returned.zones.vanguard.length, 0);
  assert.equal(
    returned.zones.g.find((card) => card.key === "20:0")?.faceDown,
    false,
  );
  assert.deepEqual(inventory(returned), inventory(empty));

  const noVanguard = {
    ...before,
    zones: {
      ...before.zones,
      vanguard: [],
      soul: [...before.zones.soul, ...before.zones.vanguard],
    },
  };
  const withoutHeart = moveCards(noVanguard, ["20:0"], "vanguard");
  assert.equal(heartCard(context(withoutHeart)), undefined);
  const orphanReturned = nextPhase({ ...withoutHeart, phase: "battle" });
  assert.equal(orphanReturned.zones.vanguard.length, 0);
  assert.deepEqual(orphanReturned.zones.soul, noVanguard.zones.soul);
  assert.deepEqual(inventory(orphanReturned), inventory(noVanguard));

  const charged = takeTop(manuallyMoved, "soul");
  assert.equal(
    heartCard(context(charged))?.key,
    "3:0",
    "charging adds below the heart",
  );
});

test("ordinary temporary rides such as RevolDress retain their existing soul restoration", () => {
  const before = rideReady();
  const form = before.zones.hand[0];
  const dressed = moveCards(before, [form.key], "vanguard");
  assert.equal(dressed.stride, null);
  assert.equal(heartCard(context(dressed)), undefined);
  assert.equal(soulCards(dressed).length, 2);
  const returned = moveCards(dressed, [form.key], "bind");
  assert.equal(returned.zones.vanguard[0].key, "3:0");
  assert.equal(returned.zones.bind[0].key, form.key);
  assert.deepEqual(inventory(returned), inventory(before));
});

test("stride, End return and all Undo frames survive refresh; legacy identities hydrate without rewriting storage", () => {
  const version = { id: 1, deck_id: 1, cards: entries } as DeckVersion;
  const source = playtestSource(version);
  const copies = listCopies(entries);
  const before = rideReady();
  const active = stride(context(before), "20:0");
  const end = nextPhase({ ...active, phase: "battle" });
  const state = {
    starterKey: "2:0",
    history: { past: [before, active], present: end },
  };
  const data = new Map<string, string>();
  let writes = 0;
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
      writes++;
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  createPlaytestStore(() => storage).save(source, state);
  const restored = createPlaytestStore(() => storage).restore(source, copies);
  assert.deepEqual(restored.state, state);
  assert.equal(heartCard(context(restored.state!.history.past[1]))?.key, "3:0");
  assert.equal(writes, 1);

  const legacy = JSON.parse(data.get(PLAYTEST_STORAGE_KEY)!);
  for (const frame of [
    ...legacy.state.history.past,
    legacy.state.history.present,
  ]) {
    delete frame.stride;
    for (const cards of Object.values(frame.zones) as { gUnit?: true }[][]) {
      for (const card of cards) delete card.gUnit;
    }
  }
  data.set(PLAYTEST_STORAGE_KEY, JSON.stringify(legacy));
  const hydrated = createPlaytestStore(() => storage).restore(source, copies);
  assert.equal(hydrated.notice, "");
  const oldActive = hydrated.state!.history.past[1];
  assert.equal(isGUnit(oldActive.zones.vanguard[0]), true);
  assert.equal(heartCard(context(oldActive))?.key, "3:0");
  assert.equal(
    nextPhase({ ...oldActive, phase: "battle" }).zones.vanguard[0].key,
    "3:0",
  );
  assert.equal(writes, 1, "migration is memory only until an action is saved");
});

test("restoring legacy G-to-Crest drops recovers every hidden G copy face up in all Undo frames", () => {
  const version = { id: 1, deck_id: 1, cards: entries } as DeckVersion;
  const source = playtestSource(version);
  let before = rideReady();
  before = moveCards(before, ["22:0", "21:0"], "crest");
  function hiddenFrame(key: string) {
    const hidden = before.zones.g.find((card) => card.key === key)!;
    return {
      ...before,
      zones: {
        ...before.zones,
        g: before.zones.g.filter((card) => card.key !== key),
        crest: [...before.zones.crest, hidden],
      },
    };
  }
  const frames = [
    hiddenFrame("20:0"),
    hiddenFrame("20:1"),
    hiddenFrame("20:2"),
  ];
  const original = {
    schema: 2,
    source,
    state: {
      starterKey: "2:0",
      history: { past: frames.slice(0, 2), present: frames[2] },
    },
  };
  const legacy = JSON.parse(JSON.stringify(original));
  for (const frame of [
    ...legacy.state.history.past,
    legacy.state.history.present,
  ]) {
    for (const cards of Object.values(frame.zones) as { gUnit?: true }[][]) {
      for (const card of cards) delete card.gUnit;
    }
  }
  const raw = JSON.stringify(legacy);
  let writes = 0;
  const storage = {
    getItem: () => raw,
    setItem: () => {
      writes++;
    },
    removeItem: () => {
      throw new Error("valid recovery must not discard storage");
    },
  };
  const store = createPlaytestStore(() => storage);
  const restored = store.restore(source, listCopies(entries));
  assert.equal(restored.notice, "");
  assert.equal(restored.backedUp, true);
  const recoveredFrames = [
    ...restored.state!.history.past,
    restored.state!.history.present!,
  ];
  for (const [index, frame] of recoveredFrames.entries()) {
    const key = `20:${index}`;
    assert.deepEqual(
      frame.zones.crest.map((card) => card.key),
      ["22:0", "21:0"],
      "actual crests and typed non-G units keep their saved positions",
    );
    const recovered = frame.zones.g.find((card) => card.key === key)!;
    assert.equal(recovered.gUnit, true);
    assert.equal(recovered.faceDown, false);
    assert.equal(frame.zones.g.filter((card) => card.key === key).length, 1);
    assert.equal(frame.zones.vanguard[0].key, "3:0");
    assert.deepEqual(inventory(frame), inventory(frames[index]));
    assert.deepEqual(frame.rules, frames[index].rules);
    assert.deepEqual(frame.log, frames[index].log);
    assert.deepEqual(frame.zones.soul, frames[index].zones.soul);
  }
  assert.equal(
    writes,
    0,
    "recovery waits for the next completed action to save",
  );
  assert.deepEqual(
    store.restore(source, listCopies(entries)).state,
    restored.state,
    "repeated restores never duplicate a repaired card",
  );
  assert.equal(
    JSON.stringify(legacy),
    raw,
    "old saved Undo frames were not mutated",
  );
});

test("malformed heart associations or G identity flags cannot silently restore an unrelated unit", () => {
  const version = { id: 1, deck_id: 1, cards: entries } as DeckVersion;
  const source = playtestSource(version);
  const active = stride(context(rideReady()), "20:0");
  for (const invalid of [
    { ...active, stride: { gUnitKey: "20:1", heartKey: "3:0" } },
    { ...active, stride: { gUnitKey: "20:0", heartKey: "missing" } },
    { ...active, stride: { gUnitKey: "20:0", heartKey: "20:1" } },
    {
      ...active,
      zones: {
        ...active.zones,
        soul: active.zones.soul.map((card) => ({ ...card, gUnit: true })),
      },
    },
  ]) {
    const saved = JSON.stringify({
      schema: 2,
      source,
      state: { starterKey: "2:0", history: { past: [], present: invalid } },
    });
    const storage = {
      getItem: () => saved,
      setItem: () => {},
      removeItem: () => {},
    };
    const result = createPlaytestStore(() => storage).restore(
      source,
      listCopies(entries),
    );
    assert.equal(result.state, null);
    assert.match(result.notice, /could not be restored/);
  }
});

test("G Morfessa's GB1 only uses actual G units, never ordinary units or crests in G", () => {
  const session = rideReady();
  const morfessa = {
    key: "morfessa",
    cardId: 99,
    entryId: 99,
    rested: false,
    faceDown: false,
    power: 0,
    critical: 0,
  };
  const map = new Map(entryMap);
  map.set(99, {
    id: 99,
    card_id: 99,
    zone: "main",
    quantity: 1,
    card: { name: "Dragwizard, Morfessa", grade: 2 },
    printing: { set_code: "G-BT09" },
  } as DeckCardEntry);
  const falseGb = changeCards(session, ["21:0"], "flip");
  assert.equal(
    effectiveGrade({ session: falseGb, entries: map }, morfessa, "drop"),
    2,
  );
  const realGb = turnFaceUpGUnits(context(falseGb), ["20:0"]);
  assert.equal(
    effectiveGrade({ session: realGb, entries: map }, morfessa, "drop"),
    1,
  );
});
