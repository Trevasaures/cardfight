import { migrateRuleState, validRules } from "./rules/storage.ts";
import type { DeckVersion } from "../../types/api.ts";
import {
  ATTACK_CIRCLES,
  CIRCLES,
  PHASES,
  ZONES,
  type TableCard,
  type TableSession,
} from "./playtest.ts";

export const MAX_UNDO_STATES = 80;
export const PLAYTEST_STORAGE_KEY = "cardfight.hand-lab.session";
const SAVE_SCHEMA = 2;

export type PlaytestHistory = {
  past: TableSession[];
  present: TableSession | null;
};
export type PlaytestState = {
  history: PlaytestHistory;
  starterKey: string | null;
};
type SessionSource = {
  deckId: number;
  versionId: number;
  cards: string;
};
type SavedPlaytest = {
  schema: number;
  source: SessionSource;
  state: PlaytestState;
};
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RestoreResult = {
  state: PlaytestState | null;
  backedUp: boolean;
  notice: string;
};

export function playtestSource(version: DeckVersion): SessionSource {
  // Text, artwork, and timestamps may change without invalidating physical card copies.
  const cards = version.cards
    .map((entry) => [entry.id, entry.card_id, entry.quantity, entry.zone])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  return {
    deckId: version.deck_id,
    versionId: version.id,
    cards: JSON.stringify(cards),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSession(
  value: unknown,
  inventory: Map<string, TableCard>,
): value is TableSession {
  if (
    !isRecord(value) ||
    !isRecord(value.zones) ||
    typeof value.first !== "boolean" ||
    !Number.isSafeInteger(value.turn) ||
    Number(value.turn) < 0 ||
    !["you", "opponent"].includes(String(value.active)) ||
    !["mulligan", ...PHASES].includes(String(value.phase)) ||
    !Number.isInteger(value.energy) ||
    Number(value.energy) < 0 ||
    Number(value.energy) > 15 ||
    !validRules(value.rules) ||
    !Array.isArray(value.log) ||
    value.log.length > 40 ||
    !value.log.every((line) => typeof line === "string")
  )
    return false;

  const seen = new Set<string>();
  for (const zone of Object.keys(ZONES) as (keyof typeof ZONES)[]) {
    const cards = value.zones[zone];
    if (!Array.isArray(cards) || (CIRCLES.includes(zone) && cards.length > 1)) {
      return false;
    }
    for (const card of cards) {
      if (!isRecord(card) || typeof card.key !== "string") return false;
      const original = inventory.get(card.key);
      if (
        !original ||
        seen.has(card.key) ||
        card.entryId !== original.entryId ||
        card.cardId !== original.cardId ||
        typeof card.rested !== "boolean" ||
        typeof card.faceDown !== "boolean" ||
        !Number.isSafeInteger(card.power) ||
        !Number.isSafeInteger(card.critical)
      )
        return false;
      seen.add(card.key);
    }
  }
  if (seen.size !== inventory.size) return false;

  const zones = value.zones as TableSession["zones"];
  if (
    value.attackerKey !== null &&
    !ATTACK_CIRCLES.some((zone) =>
      zones[zone].some((card) => card.key === value.attackerKey),
    )
  )
    return false;
  if (value.check !== null) {
    const check = value.check;
    if (
      !isRecord(check) ||
      !["drive", "damage"].includes(String(check.kind)) ||
      !zones.reveal.some((card) => card.key === check.key)
    )
      return false;
  }
  return true;
}

function validState(
  value: unknown,
  copies: readonly TableCard[],
): value is PlaytestState {
  if (!isRecord(value) || !isRecord(value.history)) return false;
  const inventory = new Map(copies.map((card) => [card.key, card]));
  return (
    (value.starterKey === null ||
      (typeof value.starterKey === "string" &&
        inventory.has(value.starterKey))) &&
    validSession(value.history.present, inventory) &&
    Array.isArray(value.history.past) &&
    value.history.past.length <= MAX_UNDO_STATES &&
    value.history.past.every((session) => validSession(session, inventory))
  );
}

/** One active game per tab. React can unmount the table without discarding its data. */
export function createPlaytestStore(
  getStorage: () => StorageAccess | undefined,
) {
  let cached: unknown;
  let loaded = false;
  let backedUp = false;

  function discard() {
    cached = null;
    backedUp = false;
    try {
      getStorage()?.removeItem(PLAYTEST_STORAGE_KEY);
    } catch {
      // Memory recovery still works when the browser blocks storage.
    }
  }

  function restore(
    source: SessionSource,
    copies: readonly TableCard[],
  ): RestoreResult {
    const empty: RestoreResult = { state: null, backedUp: false, notice: "" };
    if (!loaded) {
      loaded = true;
      try {
        const raw = getStorage()?.getItem(PLAYTEST_STORAGE_KEY);
        cached = raw ? JSON.parse(raw) : null;
        backedUp = Boolean(raw);
      } catch {
        discard();
      }
    }
    if (!cached) return empty;
    if (isRecord(cached) && cached.schema === 1) {
      cached = { ...cached, schema: SAVE_SCHEMA, state: migrateRuleState(cached.state) };
    }
    if (
      !isRecord(cached) ||
      cached.schema !== SAVE_SCHEMA ||
      !isRecord(cached.source)
    ) {
      discard();
      return {
        ...empty,
        notice: "Saved playtest could not be restored. Start a new game.",
      };
    }
    // Browsing another deck must not erase the active game. Dealing replaces it.
    if (
      cached.source.deckId !== source.deckId ||
      cached.source.versionId !== source.versionId
    ) {
      return empty;
    }
    if (cached.source.cards !== source.cards) {
      discard();
      return { ...empty, notice: "Deck list changed. Start a new playtest." };
    }
    if (!validState(cached.state, copies)) {
      discard();
      return {
        ...empty,
        notice: "Saved playtest could not be restored. Start a new game.",
      };
    }
    return { state: cached.state, backedUp, notice: "" };
  }

  function save(source: SessionSource, state: PlaytestState): boolean {
    const snapshot: SavedPlaytest = {
      schema: SAVE_SCHEMA,
      source,
      state: {
        ...state,
        history: {
          ...state.history,
          past: state.history.past.slice(-MAX_UNDO_STATES),
        },
      },
    };
    cached = snapshot;
    loaded = true;
    backedUp = false;
    // Called only for completed game actions, never for pointer movement or card selection.
    try {
      const storage = getStorage();
      if (storage) {
        storage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(snapshot));
        backedUp = true;
      }
    } catch {
      try {
        // Do not leave an older checkpoint that could silently revive after refresh.
        getStorage()?.removeItem(PLAYTEST_STORAGE_KEY);
      } catch {
        // The live game remains usable, with a visible memory-only save status.
      }
    }
    return backedUp;
  }

  return { restore, save };
}

export const playtestStore = createPlaytestStore(() =>
  typeof window === "undefined" ? undefined : window.sessionStorage,
);
