import assert from "node:assert/strict";
import test from "node:test";
import type { DeckVersion } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  changePower, finishMulligan, listCopies, startTable,
  type TableCard,
} from "../src/features/hand-lab/playtest.ts";
import {
  addPersonaShieldTicket, removePersonaTicket,
} from "../src/features/hand-lab/rules/index.ts";
import {
  createPlaytestStore, PLAYTEST_STORAGE_KEY, playtestSource,
  type PlaytestState,
} from "../src/features/hand-lab/sessionStore.ts";

const version = {
  id: 7,
  deck_id: 3,
  cards: [
    { id: 1, card_id: 11, quantity: 16, zone: "main", card: { grade: 1 } },
    { id: 2, card_id: 12, quantity: 1, zone: "ride", card: { grade: 0 } },
  ],
} as DeckVersion;
const source = playtestSource(version);
const copies = listCopies(version.cards);

function memoryStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    get writes() { return writes; },
  };
}

function ticket(serial: number): TableCard {
  return {
    key: `ticket:personaShield:${serial}`, cardId: -1, entryId: -1,
    ticket: "personaShield", rested: false, faceDown: false, power: 0, critical: 0,
  };
}

function game(): PlaytestState {
  const opening = finishMulligan(startTable(version.cards, true, "2:0", seededRandom(5)), []);
  const initial = changePower(opening, ["2:0"], 5000);
  const firstTicket = addPersonaShieldTicket(initial);
  const acquired = addPersonaShieldTicket(firstTicket);
  const removed = removePersonaTicket(acquired, ticket(1).key);
  return {
    starterKey: "2:0",
    history: { past: [initial, firstTicket, acquired], present: removed },
  };
}

function savedGame(storage: ReturnType<typeof memoryStorage>) {
  createPlaytestStore(() => storage).save(source, game());
  return JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY)!);
}

test("manual generation, ticket removal, power adjustments and Undo recover exactly", () => {
  const storage = memoryStorage();
  const state = game();
  const store = createPlaytestStore(() => storage);
  store.save(source, state);
  assert.equal(JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY)!).schema, 3);
  assert.deepEqual(store.restore(source, copies).state, state);
  const restored = createPlaytestStore(() => storage).restore(source, copies).state!;
  assert.deepEqual(restored, state);
  assert.equal(storage.writes, 1, "recovery never creates tickets or rewrites storage");
  assert.equal(restored.history.present!.zones.vanguard[0].power, 5000);
  assert.deepEqual(restored.history.present!.persona, { nextTicket: 3 });
  assert.deepEqual(
    restored.history.present!.zones.hand.filter((card) => card.ticket).map((card) => card.key),
    [ticket(2).key],
  );
  const undone: PlaytestState = {
    starterKey: restored.starterKey,
    history: { past: restored.history.past.slice(0, -1), present: restored.history.past.at(-1)! },
  };
  store.save(source, undone);
  const recoveredUndo = createPlaytestStore(() => storage).restore(source, copies).state!;
  assert.deepEqual(recoveredUndo, undone);
  assert.equal(recoveredUndo.history.present!.zones.hand.filter((card) => card.ticket).length, 2);
  assert.deepEqual(recoveredUndo.history.present!.persona, { nextTicket: 3 });
  assert.equal(recoveredUndo.history.present!.zones.vanguard[0].power, 5000);
});

test("schema 3 drops retired acquisition, crest and quota fields in every saved frame", () => {
  const storage = memoryStorage();
  const expected = game();
  const legacy = savedGame(storage);
  for (const frame of [legacy.state.history.present, ...legacy.state.history.past]) {
    frame.persona.nextAcquisition = 7;
    frame.persona.acquiredThisTurn = true;
    frame.persona.blitzPlayed = 2;
    frame.persona.blitzLimit = 2;
    frame.persona.opponentCrest = "retired setting";
    frame.persona.defense = null;
    frame.persona.pending = [{ id: 6, sourceKey: frame.zones.hand[0].key }];
  }
  storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(legacy));
  const writes = storage.writes;
  const restored = createPlaytestStore(() => storage).restore(source, copies).state!;
  assert.deepEqual(restored, expected);
  assert.equal(storage.writes, writes);
  const next = addPersonaShieldTicket(restored.history.present!);
  assert.equal(next.zones.hand.at(-1)?.key, ticket(3).key);
  assert.deepEqual(next.zones.soul, restored.history.present!.zones.soul);
  assert.deepEqual(next.zones.drop, restored.history.present!.zones.drop);
});

test("legacy active shield power becomes one manual adjustment in live and Undo frames", () => {
  const storage = memoryStorage();
  const legacy = savedGame(storage);
  const present = legacy.state.history.present;
  present.active = "opponent";
  present.phase = "end";
  present.persona.opponentCrest = true;
  present.persona.defense = { targetKey: "2:0", bonus: 15000 };
  const previousBattle = structuredClone(present);
  previousBattle.persona.defense.bonus = 10000;
  legacy.state.history.past.push(previousBattle);
  storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(legacy));
  const store = createPlaytestStore(() => storage);
  const restored = store.restore(source, copies).state!;
  assert.ok(restored);
  assert.equal(restored.history.present!.zones.vanguard[0].power, 20000);
  assert.equal(restored.history.past.at(-1)!.zones.vanguard[0].power, 15000);
  assert.deepEqual(restored.history.present!.persona, { nextTicket: 3 });
  assert.equal(restored.history.present!.zones.hand.filter((card) => card.ticket).length, 1);
  assert.deepEqual(store.restore(source, copies).state, restored, "cached recovery cannot add the bonus twice");
  assert.deepEqual(createPlaytestStore(() => storage).restore(source, copies).state, restored);
  store.save(source, restored);
  assert.deepEqual(createPlaytestStore(() => storage).restore(source, copies).state, restored, "saving the migrated game remains idempotent");
  const undone: PlaytestState = {
    starterKey: restored.starterKey,
    history: { past: restored.history.past.slice(0, -1), present: restored.history.past.at(-1)! },
  };
  store.save(source, undone);
  assert.deepEqual(createPlaytestStore(() => storage).restore(source, copies).state, undone);
});

test("legacy shield stacks above 30k migrate without a quota while new power remains manual", () => {
  for (const bonus of [0, 10000, 15000, 20000, 25000, 30000, 35000, 45000, 60000]) {
    const storage = memoryStorage();
    const legacy = savedGame(storage);
    const frame = legacy.state.history.present;
    const consumed = Math.ceil(bonus / 15000);
    frame.active = "opponent";
    frame.zones.hand = [...frame.zones.hand.filter((card: TableCard) => !card.ticket), ticket(consumed + 1)];
    frame.persona = { nextTicket: consumed + 2, defense: { targetKey: "2:0", bonus } };
    storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(legacy));
    const restored = createPlaytestStore(() => storage).restore(source, copies).state!;
    assert.ok(restored, `legacy bonus ${bonus}`);
    assert.equal(restored.history.present!.zones.vanguard[0].power, 5000 + bonus);
    const adjusted = changePower(restored.history.present!, ["2:0"], 17000);
    const state: PlaytestState = { ...restored, history: { past: [], present: adjusted } };
    createPlaytestStore(() => storage).save(source, state);
    assert.deepEqual(createPlaytestStore(() => storage).restore(source, copies).state, state);
  }
});

test("schema 1 and 2 add dormant ticket state to every Undo frame without replaying effects", () => {
  for (const schema of [1, 2]) {
    const storage = memoryStorage();
    const initial = game().history.past[0];
    const state: PlaytestState = {
      starterKey: "2:0", history: { past: [initial], present: { ...initial, log: ["Existing game"] } },
    };
    createPlaytestStore(() => storage).save(source, state);
    const saved = JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY)!);
    saved.schema = schema;
    for (const frame of [saved.state.history.present, ...saved.state.history.past]) {
      delete frame.persona;
      if (schema === 1) { delete frame.rules; delete frame.zones.gauge; }
    }
    storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(saved));
    const writes = storage.writes;
    assert.deepEqual(createPlaytestStore(() => storage).restore(source, copies).state, state);
    assert.equal(storage.writes, writes);
  }
});

test("generated tickets cannot replace physical inventory or forge serials, identity, or zones", () => {
  const storage = memoryStorage();
  const saved = savedGame(storage);
  const corruptions: [string, (frame: typeof saved.state.history.present) => void][] = [
    ["duplicate serial", (frame) => { frame.zones.hand.push(ticket(2)); }],
    ["reused next serial", (frame) => { frame.persona.nextTicket = 2; }],
    ["missing counter state", (frame) => { delete frame.persona; }],
    ["negative counter", (frame) => { frame.persona.nextTicket = -1; }],
    ["unsafe counter", (frame) => { frame.persona.nextTicket = 9e20; }],
    ["string counter", (frame) => { frame.persona.nextTicket = "3"; }],
    ["zero serial", (frame) => { frame.zones.hand.at(-1).key = "ticket:personaShield:0"; }],
    ["noncanonical serial", (frame) => { frame.zones.hand.at(-1).key = "ticket:personaShield:02"; }],
    ["unsafe serial", (frame) => { frame.zones.hand.at(-1).key = "ticket:personaShield:9007199254740992"; }],
    ["wrong card", (frame) => { frame.zones.hand.at(-1).cardId = 11; }],
    ["wrong entry", (frame) => { frame.zones.hand.at(-1).entryId = 1; }],
    ["wrong type", (frame) => { frame.zones.hand.at(-1).ticket = "other"; }],
    ["missing type", (frame) => { delete frame.zones.hand.at(-1).ticket; }],
    ["crest ticket", (frame) => { frame.zones.hand.at(-1).crest = true; }],
    ["G unit ticket", (frame) => { frame.zones.hand.at(-1).gUnit = true; }],
    ["rested ticket", (frame) => { frame.zones.hand.at(-1).rested = true; }],
    ["face down ticket", (frame) => { frame.zones.hand.at(-1).faceDown = true; }],
    ["powered ticket", (frame) => { frame.zones.hand.at(-1).power = 5000; }],
    ["critical ticket", (frame) => { frame.zones.hand.at(-1).critical = 1; }],
    ["ticket in deck", (frame) => { frame.zones.deck.push(frame.zones.hand.pop()); }],
    ["missing physical copy", (frame) => { frame.zones.deck.pop(); }],
    ["physical key masquerade", (frame) => { frame.zones.hand.at(-1).key = frame.zones.deck.pop().key; }],
    ["physical type masquerade", (frame) => { frame.zones.hand[0].ticket = "personaShield"; }],
  ];
  for (const [name, corrupt] of corruptions) {
    const invalid = structuredClone(saved);
    corrupt(invalid.state.history.present);
    storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(invalid));
    const restored = createPlaytestStore(() => storage).restore(source, copies);
    assert.equal(restored.state, null, name);
    assert.match(restored.notice, /could not be restored/, name);
    assert.equal(storage.getItem(PLAYTEST_STORAGE_KEY), null, name);
  }
  const invalidUndo = structuredClone(saved);
  invalidUndo.state.history.past[1].persona.nextTicket = 1;
  storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(invalidUndo));
  assert.equal(createPlaytestStore(() => storage).restore(source, copies).state, null);
});

test("invalid legacy defense data or overflowing power cannot migrate into live or Undo frames", () => {
  const storage = memoryStorage();
  const saved = savedGame(storage);
  saved.state.history.present.active = "opponent";
  saved.state.history.present.persona.defense = { targetKey: "2:0", bonus: 15000 };
  const corruptions: [string, (frame: typeof saved.state.history.present) => void][] = [
    ["missing target", (frame) => { frame.persona.defense.targetKey = "missing"; }],
    ["target outside field", (frame) => { frame.persona.defense.targetKey = frame.zones.hand[0].key; }],
    ["face down target", (frame) => { frame.zones.vanguard[0].faceDown = true; }],
    ["own turn defense", (frame) => { frame.active = "you"; }],
    ["mulligan defense", (frame) => { frame.phase = "mulligan"; }],
    ["unsupported 5k bonus", (frame) => { frame.persona.defense.bonus = 5000; }],
    ["bonus exceeds spent copies", (frame) => { frame.persona.defense.bonus = 30000; }],
    ["negative bonus", (frame) => { frame.persona.defense.bonus = -10000; }],
    ["fractional bonus", (frame) => { frame.persona.defense.bonus = 10000.5; }],
    ["unsafe bonus", (frame) => { frame.persona.defense.bonus = 9e20; }],
    ["string bonus", (frame) => { frame.persona.defense.bonus = "15000"; }],
    ["unachievable increment", (frame) => { frame.persona.defense.bonus = 12000; }],
    ["power overflow", (frame) => { frame.zones.vanguard[0].power = Number.MAX_SAFE_INTEGER - 5000; }],
    ["malformed defense", (frame) => { frame.persona.defense = []; }],
  ];
  for (const [name, corrupt] of corruptions) {
    for (const location of ["present", "undo"]) {
      const invalid = structuredClone(saved);
      if (location === "present") corrupt(invalid.state.history.present);
      else {
        const frame = structuredClone(invalid.state.history.present);
        corrupt(frame);
        invalid.state.history.past.push(frame);
      }
      storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(invalid));
      assert.equal(createPlaytestStore(() => storage).restore(source, copies).state, null, `${name} in ${location}`);
    }
  }
});
