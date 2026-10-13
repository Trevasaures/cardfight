import assert from "node:assert/strict";
import test from "node:test";
import type { DeckCardEntry, DeckVersion } from "../src/types/api.ts";
import {
  mainDeckCopies,
  seededRandom,
} from "../src/features/hand-lab/engine.ts";
import {
  canDropCards,
  changeCards,
  changePower,
  finishMulligan,
  listCopies,
  moveCards,
  startTable,
  ZONES,
  type TableSession,
  type Zone,
} from "../src/features/hand-lab/playtest.ts";
import { crestViews } from "../src/features/hand-lab/crests.ts";
import { toggleCrest } from "../src/features/hand-lab/crestActions.ts";
import { hasRuleToken } from "../src/features/hand-lab/rules/types.ts";
import { setRuleToken } from "../src/features/hand-lab/rules/index.ts";
import {
  createPlaytestStore,
  PLAYTEST_STORAGE_KEY,
  playtestSource,
} from "../src/features/hand-lab/sessionStore.ts";

const main = {
  id: 1,
  card_id: 1,
  quantity: 10,
  zone: "main",
  card: { name: "Main unit", grade: 1, card_type: "Normal Unit" },
} as DeckCardEntry;
function crest(id: number, name: string, type = "Crest", zone = "crest") {
  return {
    id,
    card_id: id,
    quantity: 1,
    zone,
    card: { name, grade: null, card_type: type },
  } as DeckCardEntry;
}
const nightrose = crest(2, "Nightrose Crest");
const generator = crest(3, "Energy Generator", "Ride Deck Crest");
const game = (entries: DeckCardEntry[]) =>
  finishMulligan(startTable(entries, true, null, seededRandom(3)), []);
const context = (session: TableSession, entries: DeckCardEntry[]) => ({
  session,
  entries: new Map(entries.map((entry) => [entry.id, entry])),
});
const inventory = (session: TableSession) =>
  Object.values(session.zones)
    .flat()
    .map((card) => card.key)
    .sort();

test("optional and legacy type-marked crests start available outside the main and ride decks", () => {
  const legacy = crest(4, "Legacy Crest", "Crest", "main");
  const entries = [main, nightrose, generator, legacy];
  const session = startTable(entries, true, null, seededRandom(3));
  assert.equal(mainDeckCopies(entries).length, 10);
  assert.equal(session.zones.hand.length, 5);
  assert.equal(session.zones.deck.length, 5);
  assert.deepEqual(
    session.zones.reserve.map((card) => card.key),
    ["2:0", "3:0", "4:0"],
  );
  assert.ok(session.zones.reserve.every((card) => card.crest));
  assert.equal(session.zones.crest.length, 0);
  assert.deepEqual(
    inventory(session),
    listCopies(entries)
      .map((card) => card.key)
      .sort(),
  );
  assert.equal(
    startTable([main], true, null).zones.reserve.length,
    0,
    "a deck needs no stride crest",
  );
  assert.throws(() => startTable(entries, true, "3:0"), /starter/);
});

test("every deck exposes an available virtual Energy Generator without inventing a playable card", () => {
  const session = game([main]);
  const views = crestViews(context(session, [main]));
  assert.equal(views.length, 1);
  assert.equal(views[0].virtual, true);
  assert.equal(views[0].active, false);
  assert.equal(views[0].card, undefined);
  const active = toggleCrest(context(session, [main]), views[0]);
  assert.equal(hasRuleToken(context(active, [main]), "energyGenerator"), true);
  assert.deepEqual(inventory(active), inventory(session));
  assert.equal(
    session.rules.tokens.energyGenerator,
    false,
    "undo snapshot stays unchanged",
  );
  const removed = toggleCrest(
    context(active, [main]),
    crestViews(context(active, [main]))[0],
  );
  assert.equal(removed.rules.tokens.energyGenerator, false);
  const opening = startTable([main], true, null);
  assert.equal(
    toggleCrest(
      context(opening, [main]),
      crestViews(context(opening, [main]))[0],
    ),
    opening,
  );
});

test("Nightrose remains optional and activates manually alongside the separate generator", () => {
  const entries = [main, nightrose];
  const before = game(entries);
  const view = crestViews(context(before, entries)).find(
    (item) => !item.virtual,
  )!;
  assert.equal(view.active, false);
  const after = toggleCrest(context(before, entries), view);
  assert.equal(after.zones.crest[0].key, "2:0");
  assert.equal(after.zones.reserve.length, 0);
  assert.equal(
    after.energy,
    before.energy,
    "placement does not guess card-specific effects",
  );
  assert.equal(after.rules.tokens.energyGenerator, false);
  assert.deepEqual(inventory(after), inventory(before));
  const returned = toggleCrest(
    context(after, entries),
    crestViews(context(after, entries)).find((item) => !item.virtual)!,
  );
  assert.equal(returned.zones.crest.length, 0);
  assert.equal(returned.zones.reserve[0].key, "2:0");
});

test("a printed generator replaces the virtual tile and is active only face up in Crest", () => {
  const entries = [main, nightrose, generator];
  const before = game(entries);
  let views = crestViews(context(before, entries));
  assert.equal(views.length, 2);
  assert.ok(views.every((item) => !item.virtual));
  assert.equal(
    hasRuleToken(context(before, entries), "energyGenerator"),
    false,
  );
  let after = toggleCrest(
    context(before, entries),
    views.find((item) => item.energyGenerator)!,
  );
  assert.equal(
    after.rules.tokens.energyGenerator,
    false,
    "physical presence is the source",
  );
  assert.equal(hasRuleToken(context(after, entries), "energyGenerator"), true);
  after = changeCards(after, ["3:0"], "flip");
  assert.equal(hasRuleToken(context(after, entries), "energyGenerator"), false);
  views = crestViews(context(after, entries));
  after = toggleCrest(
    context(after, entries),
    views.find((item) => item.energyGenerator)!,
  );
  assert.equal(after.zones.crest[0].faceDown, false);
  assert.equal(hasRuleToken(context(after, entries), "energyGenerator"), true);
  assert.deepEqual(inventory(after), inventory(before));
});

test("crests reject playable destinations and unit edits atomically, including mixed selections", () => {
  const before = game([main, nightrose]);
  const unit = before.zones.hand[0].key;
  for (const zone of Object.keys(ZONES) as Zone[]) {
    if (zone === "crest" || zone === "reserve") continue;
    assert.equal(canDropCards(before, ["2:0"], zone), false, zone);
    assert.equal(moveCards(before, ["2:0"], zone), before, zone);
    assert.equal(
      moveCards(before, [unit, "2:0"], zone),
      before,
      `mixed ${zone}`,
    );
  }
  assert.equal(canDropCards(before, ["2:0"], "crest"), true);
  for (const change of [
    "rest",
    "power+",
    "power-",
    "power+2k",
    "power-2k",
    "power+100m",
    "critical+",
    "critical-",
  ] as const) {
    assert.equal(changeCards(before, ["2:0"], change), before, change);
    assert.equal(
      changeCards(before, [unit, "2:0"], change),
      before,
      `mixed ${change}`,
    );
  }
  assert.equal(changePower(before, ["2:0"], 10000), before);
  assert.deepEqual(
    inventory(moveCards(before, ["2:0"], "crest")),
    inventory(before),
  );
  const legacy = {
    ...before,
    zones: {
      ...before.zones,
      hand: [...before.zones.hand, before.zones.reserve[0]],
      reserve: [],
    },
  };
  assert.equal(
    moveCards(legacy, ["2:0", legacy.zones.deck[0].key], "hand"),
    legacy,
    "an old same-zone crest cannot enable a partial mixed move",
  );
});

test("legacy virtual activation and printed generator share one tile and can be reconciled explicitly", () => {
  const entries = [main, generator];
  const before = setRuleToken(game(entries), "energyGenerator", true);
  const views = crestViews(context(before, entries));
  assert.equal(views.length, 1);
  assert.equal(views[0].active, true);
  const removed = toggleCrest(context(before, entries), views[0]);
  assert.equal(removed.rules.tokens.energyGenerator, false);
  assert.equal(removed.zones.reserve[0].key, "3:0");
  assert.equal(before.rules.tokens.energyGenerator, true);
  assert.deepEqual(inventory(removed), inventory(before));
});

test("a legacy type-less generator already in Crest remains inspectable and removable", () => {
  const legacyGenerator = {
    ...generator,
    zone: "token",
    card: { ...generator.card!, grade: 0, card_type: "Normal Unit" },
  } as DeckCardEntry;
  const entries = [main, legacyGenerator];
  const before = moveCards(game(entries), ["3:0"], "crest");
  const views = crestViews(context(before, entries));
  assert.equal(views.length, 1);
  assert.equal(views[0].card?.key, "3:0");
  assert.equal(views[0].active, true);
  const after = toggleCrest(context(before, entries), views[0]);
  assert.equal(after.zones.crest.length, 0);
  assert.equal(after.zones.reserve[0].key, "3:0");
  assert.equal(hasRuleToken(context(after, entries), "energyGenerator"), false);
  assert.deepEqual(inventory(after), inventory(before));
  const restored = toggleCrest(
    context(after, entries),
    crestViews(context(after, entries))[0],
  );
  assert.equal(restored.zones.crest[0].key, "3:0");
  assert.equal(hasRuleToken(context(restored, entries), "energyGenerator"), true);
});

test("schema 1 and 2 recovery adds crest identity to every undo frame without changing saved tokens or zones", () => {
  const entries = [main, crest(2, "Legacy Crest", "Crest", "other")];
  const version = { id: 9, deck_id: 4, cards: entries } as DeckVersion;
  const session = game(entries);
  for (const schema of [1, 2]) {
    const saved = {
      schema,
      source: playtestSource(version),
      state: {
        starterKey: null,
        history: { past: [session], present: session },
      },
    };
    const legacy = JSON.parse(JSON.stringify(saved));
    for (const frame of [
      legacy.state.history.present,
      ...legacy.state.history.past,
    ]) {
      for (const card of Object.values(frame.zones).flat() as {
        crest?: true;
      }[])
        delete card.crest;
      if (schema === 1) {
        delete frame.rules;
        delete frame.zones.gauge;
      } else frame.rules.tokens.energyGenerator = true;
    }
    const raw = JSON.stringify(legacy);
    const values = new Map([[PLAYTEST_STORAGE_KEY, raw]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const restored = createPlaytestStore(() => storage).restore(
      playtestSource(version),
      listCopies(entries),
    );
    assert.ok(restored.state);
    for (const frame of [
      restored.state.history.present!,
      ...restored.state.history.past,
    ]) {
      assert.equal(frame.zones.reserve[0].crest, true);
      assert.equal(frame.rules.tokens.energyGenerator, schema === 2);
      assert.deepEqual(inventory(frame), inventory(session));
      assert.equal(moveCards(frame, ["2:0"], "soul"), frame);
    }
    assert.equal(
      values.get(PLAYTEST_STORAGE_KEY),
      raw,
      "restore never writes or changes the historical backup",
    );
  }
});
