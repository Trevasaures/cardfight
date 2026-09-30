import assert from "node:assert/strict";
import test from "node:test";
import type { DeckVersion } from "../src/types/api.ts";
import { seededRandom } from "../src/features/hand-lab/engine.ts";
import {
  attackCard,
  beginCheck,
  changeCards,
  changeEnergy,
  finishMulligan,
  listCopies,
  moveCards,
  nextPhase,
  resolveCheck,
  startTable,
  takeTop,
} from "../src/features/hand-lab/playtest.ts";
import {
  createPlaytestStore,
  MAX_UNDO_STATES,
  PLAYTEST_STORAGE_KEY,
  playtestSource,
  type PlaytestState,
} from "../src/features/hand-lab/sessionStore.ts";
import { emptyRules } from "../src/features/hand-lab/rules/types.ts";

const version = {
  id: 7,
  deck_id: 3,
  updated_at: "2026-09-25T12:00:00",
  cards: [
    { id: 1, card_id: 1, quantity: 30, zone: "main", card: { grade: 1 } },
    { id: 2, card_id: 2, quantity: 20, zone: "main", card: { grade: 0 } },
    ...[0, 1, 2, 3].map((grade) => ({
      id: 10 + grade,
      card_id: 10 + grade,
      quantity: 1,
      zone: "ride",
      card: { grade },
    })),
    { id: 20, card_id: 20, quantity: 16, zone: "g", card: { grade: 4 } },
  ],
} as DeckVersion;
const source = playtestSource(version);
const copies = listCopies(version.cards);

function fakeStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  let full = false;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (full) throw new Error("Storage full");
      writes++;
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    setFull: () => {
      full = true;
    },
    get writes() {
      return writes;
    },
  };
}

function opening(
  first = false,
  starterKey: string | null = "10:0",
): PlaytestState {
  return {
    starterKey,
    history: {
      past: [],
      present: startTable(version.cards, first, starterKey, seededRandom(17)),
    },
  };
}

function activeGame(): PlaytestState {
  const state = opening();
  let session = nextPhase(finishMulligan(state.history.present!, []));
  for (let i = 0; i < 4; i++) session = nextPhase(session);
  const rearKey = session.zones.hand[0].key;
  session = attackCard(moveCards(session, [rearKey], "frontLeft"), rearKey);
  session = changeCards(session, [rearKey], "power+");
  session = takeTop(session, "damage");
  session = changeCards(session, [session.zones.damage[0].key], "flip");
  session = changeEnergy(session, 3);
  return {
    ...state,
    history: {
      past: [state.history.present!, session],
      present: beginCheck(session, "drive"),
    },
  };
}

test("route remount and page refresh recover exact zones, deck order, resources, pending check, and undo", () => {
  const storage = fakeStorage();
  const store = createPlaytestStore(() => storage);
  const game = activeGame();
  assert.equal(store.save(source, game), true);
  assert.deepEqual(store.restore(source, copies).state, game);
  const refreshed = createPlaytestStore(() => storage).restore(source, copies);
  assert.deepEqual(refreshed.state, game);
  assert.equal(refreshed.backedUp, true);
  assert.equal(refreshed.notice, "");
  assert.equal(
    storage.writes,
    1,
    "restoring the table does not rewrite the backup",
  );
  const resumed = refreshed.state!.history.present!;
  assert.equal(resolveCheck(resumed).check, null);
  assert.equal(resumed.zones.frontLeft[0].rested, true);
  assert.equal(resumed.zones.damage[0].faceDown, true);
  assert.equal(resumed.energy, 3);
  assert.equal(resumed.attackerKey, resumed.zones.frontLeft[0].key);
});

test("unfinished mulligans, going first, and games without a starter also restore", () => {
  for (const first of [true, false]) {
    for (const starter of ["10:0", null]) {
      const storage = fakeStorage();
      const state = opening(first, starter);
      createPlaytestStore(() => storage).save(source, state);
      assert.deepEqual(
        createPlaytestStore(() => storage).restore(source, copies).state,
        state,
      );
    }
  }
});

test("refresh preserves a temporary ride, ordered soul, and 2k bonuses", () => {
  const storage = fakeStorage();
  let session = finishMulligan(opening().history.present!, []);
  session = moveCards(session, ["13:0"], "vanguard");
  const form = session.zones.hand[0].key;
  session = moveCards(session, [form], "vanguard");
  session = takeTop(session, "soul");
  session = changeCards(session, [form], "power+2k");
  const game: PlaytestState = {
    starterKey: "10:0",
    history: { past: [], present: session },
  };
  createPlaytestStore(() => storage).save(source, game);
  const resumed = createPlaytestStore(() => storage).restore(source, copies);
  assert.deepEqual(resumed.state, game);
  const returned = moveCards(resumed.state!.history.present!, [form], "bind");
  assert.equal(returned.zones.vanguard[0].key, "13:0");
  assert.equal(returned.zones.soul.at(-1)?.key, "10:0");
  assert.equal(returned.zones.bind[0].power, 0);
});

test("card text, artwork, metadata, and response order changes preserve the game", () => {
  const store = createPlaytestStore(() => fakeStorage());
  const game = activeGame();
  store.save(source, game);
  const updated = {
    ...version,
    updated_at: "2026-09-26T14:00:00",
    cards: [...version.cards].reverse().map((entry) => ({
      ...entry,
      card: {
        ...entry.card!,
        skill_text: "Updated ability",
        name: "Updated title",
      },
      printing: { image_url: "/artwork/example.webp" },
    })),
  } as DeckVersion;
  assert.deepEqual(playtestSource(updated), source);
  assert.deepEqual(
    store.restore(playtestSource(updated), listCopies(updated.cards)).state,
    game,
  );
});

test("changed card identities, quantities, and deck zones invalidate incompatible games", () => {
  for (const changes of [
    { card_id: 99 },
    { quantity: 29 },
    { zone: "other" },
  ]) {
    const storage = fakeStorage();
    const store = createPlaytestStore(() => storage);
    store.save(source, activeGame());
    const changed = {
      ...version,
      cards: version.cards.map((entry, index) =>
        index ? entry : { ...entry, ...changes },
      ),
    } as DeckVersion;
    const restored = store.restore(
      playtestSource(changed),
      listCopies(changed.cards),
    );
    assert.equal(restored.state, null);
    assert.match(restored.notice, /Deck list changed/);
    assert.equal(storage.getItem(PLAYTEST_STORAGE_KEY), null);
  }
});

test("browsing another version keeps the active game; dealing a new game replaces it", () => {
  const storage = fakeStorage();
  const store = createPlaytestStore(() => storage);
  const game = activeGame();
  const otherSource = playtestSource({ ...version, id: 8 });
  store.save(source, game);
  assert.equal(store.restore(otherSource, copies).state, null);
  assert.deepEqual(store.restore(source, copies).state, game);
  const replacement = opening(true);
  store.save(otherSource, replacement);
  assert.equal(store.restore(source, copies).state, null);
  assert.deepEqual(
    createPlaytestStore(() => storage).restore(otherSource, copies).state,
    replacement,
  );
});

test("undo and restarting persist immediately and history stays bounded", () => {
  const storage = fakeStorage();
  const store = createPlaytestStore(() => storage);
  const game = activeGame();
  game.history.past = Array.from({ length: 100 }, () => game.history.past[0]);
  store.save(source, game);
  const restored = createPlaytestStore(() => storage).restore(
    source,
    copies,
  ).state!;
  assert.equal(restored.history.past.length, MAX_UNDO_STATES);
  const undone = {
    ...restored,
    history: {
      past: restored.history.past.slice(0, -1),
      present: restored.history.past.at(-1)!,
    },
  };
  store.save(source, undone);
  assert.deepEqual(
    createPlaytestStore(() => storage).restore(source, copies).state,
    undone,
  );
  const restarted = opening(true, null);
  store.save(source, restarted);
  assert.deepEqual(
    createPlaytestStore(() => storage).restore(source, copies).state,
    restarted,
  );
});

test("invalid JSON, save schemas, duplicate copies, and stale check or attacker references are ignored", () => {
  const storage = fakeStorage();
  createPlaytestStore(() => storage).save(source, activeGame());
  const saved = JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY)!);
  const mutations = [
    (value: typeof saved) => {
      value.schema = 999;
    },
    (value: typeof saved) => {
      value.state.history.present.zones.hand.push(
        value.state.history.present.zones.deck[0],
      );
    },
    (value: typeof saved) => {
      delete value.state.history.present.zones.soul;
    },
    (value: typeof saved) => {
      value.state.history.present.check.key = "missing";
    },
    (value: typeof saved) => {
      value.state.history.present.attackerKey = "missing";
    },
    (value: typeof saved) => {
      value.state.history.past[0].energy = -1;
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(saved);
    mutate(invalid);
    storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(invalid));
    assert.equal(
      createPlaytestStore(() => storage).restore(source, copies).state,
      null,
    );
    assert.equal(storage.getItem(PLAYTEST_STORAGE_KEY), null);
  }
  storage.setItem(PLAYTEST_STORAGE_KEY, "{broken JSON");
  assert.equal(
    createPlaytestStore(() => storage).restore(source, copies).state,
    null,
  );
});

test("blocked storage retains navigation recovery and failed backups do not leave stale checkpoints", () => {
  const denied = createPlaytestStore(() => {
    throw new Error("Storage blocked");
  });
  const game = activeGame();
  assert.equal(denied.save(source, game), false);
  assert.deepEqual(denied.restore(source, copies).state, game);
  assert.equal(denied.restore(source, copies).backedUp, false);

  const storage = fakeStorage();
  const store = createPlaytestStore(() => storage);
  store.save(source, opening());
  storage.setFull();
  assert.equal(store.save(source, game), false);
  assert.deepEqual(store.restore(source, copies).state, game);
  assert.equal(storage.getItem(PLAYTEST_STORAGE_KEY), null);
  assert.equal(
    createPlaytestStore(() => storage).restore(source, copies).state,
    null,
  );
});

test("schema 1 games migrate every undo frame without enabling new effects or changing card order", () => {
  const storage = fakeStorage();
  const game = activeGame();
  createPlaytestStore(() => storage).save(source, game);
  const legacy = JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY)!);
  legacy.schema = 1;
  for (const frame of [legacy.state.history.present, ...legacy.state.history.past]) {
    delete frame.rules;
    delete frame.zones.gauge;
  }
  storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(legacy));
  const restored = createPlaytestStore(() => storage).restore(source, copies);
  assert.deepEqual(restored.state, game);
  assert.deepEqual(restored.state!.history.present!.rules, emptyRules());
  assert.equal(restored.notice, "");
});

test("rules, 15 energy, gauges, and pending choices survive refresh and undo; malformed rules are rejected", () => {
  const storage = fakeStorage();
  const game = activeGame();
  const before = game.history.present!;
  let session = moveCards(before, [before.zones.hand[0].key], "gauge");
  session = {
    ...session,
    energy: 15,
    rules: {
      tokens: { energyGenerator: true, xceed: true },
      pending: [{ rule: "xceed", nonTriggerDamageCheck: true }],
    },
  };
  game.history = { past: [before], present: session };
  createPlaytestStore(() => storage).save(source, game);
  assert.deepEqual(createPlaytestStore(() => storage).restore(source, copies).state, game);
  const valid = JSON.parse(storage.getItem(PLAYTEST_STORAGE_KEY)!);
  for (const changes of [
    { energy: 16 },
    { rules: { ...session.rules, tokens: { xceed: "yes" } } },
    { rules: { ...session.rules, pending: [{ rule: "unknown" }] } },
  ]) {
    const corrupt = structuredClone(valid);
    Object.assign(corrupt.state.history.present, changes);
    storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(corrupt));
    assert.equal(createPlaytestStore(() => storage).restore(source, copies).state, null);
  }
});
