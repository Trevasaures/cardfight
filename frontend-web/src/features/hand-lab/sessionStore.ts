import { migrateRuleState, validRules } from "./rules/storage.ts";
import { emptyPersona, type PersonaState } from "./rules/personaTypes.ts";
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
const SAVE_SCHEMA = 3;

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

/** Generated tickets are deliberately separate from the physical deck inventory.
 * Their serial remains monotonic even after a ticket is consumed, so restoring a
 * snapshot can never reuse the identity of another ticket in that game. */
function personaTicketSerial(card: Record<string, unknown>): number | null {
  if (typeof card.key !== "string") return null;
  const match = /^ticket:personaShield:([1-9]\d*)$/.exec(card.key);
  const serial = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(serial) && serial > 0 ? serial : null;
}

function validPersona(
  value: unknown,
  ticketSerials: readonly number[],
): value is PersonaState | undefined {
  // A generated card requires the counter that establishes its stable identity.
  if (value === undefined) return ticketSerials.length === 0;
  return isRecord(value) &&
    Number.isSafeInteger(value.nextTicket) &&
    Number(value.nextTicket) >= 1 &&
    ticketSerials.every((serial) => serial < Number(value.nextTicket));
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
  const physicalKeys = new Set<string>();
  const ticketSerials: number[] = [];
  for (const zone of Object.keys(ZONES) as (keyof typeof ZONES)[]) {
    const cards = value.zones[zone];
    if (!Array.isArray(cards) || (CIRCLES.includes(zone) && cards.length > 1)) {
      return false;
    }
    for (const card of cards) {
      if (!isRecord(card) || typeof card.key !== "string") return false;
      if (
        seen.has(card.key) ||
        card.battlePower !== undefined ||
        typeof card.rested !== "boolean" ||
        typeof card.faceDown !== "boolean" ||
        !Number.isSafeInteger(card.power) ||
        !Number.isSafeInteger(card.critical)
      )
        return false;
      seen.add(card.key);
      if (card.ticket === "personaShield") {
        const serial = personaTicketSerial(card);
        if (
          serial === null ||
          zone !== "hand" ||
          inventory.has(card.key) ||
          card.entryId !== -1 ||
          card.cardId !== -1 ||
          card.crest !== undefined ||
          card.gUnit !== undefined ||
          card.rested ||
          card.faceDown ||
          card.power !== 0 ||
          card.critical !== 0
        )
          return false;
        ticketSerials.push(serial);
      } else {
        const original = inventory.get(card.key);
        if (
          !original ||
          card.ticket !== undefined ||
          card.entryId !== original.entryId ||
          card.cardId !== original.cardId ||
          (card.crest !== undefined && card.crest !== original.crest) ||
          (card.gUnit !== undefined && card.gUnit !== original.gUnit)
        )
          return false;
        physicalKeys.add(card.key);
      }
    }
  }
  if (physicalKeys.size !== inventory.size) return false;

  const zones = value.zones as TableSession["zones"];
  if (!validPersona(value.persona, ticketSerials)) return false;
  if (value.stride !== undefined && value.stride !== null) {
    const stride = value.stride;
    if (
      !isRecord(stride) ||
      typeof stride.gUnitKey !== "string" ||
      typeof stride.heartKey !== "string" ||
      !inventory.get(stride.gUnitKey)?.gUnit ||
      inventory.get(stride.heartKey)?.gUnit ||
      inventory.get(stride.heartKey)?.crest ||
      !zones.vanguard.some((card) => card.key === stride.gUnitKey) ||
      !zones.soul.some((card) => card.key === stride.heartKey)
    )
      return false;
  }
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

/** Preserve the last visible legacy shield bonus as an ordinary manual power
 * adjustment. Validation runs before conversion so malformed defense data cannot
 * forge a bonus. Removing the defense field makes subsequent recovery idempotent. */
function migrateLegacyDefense(
  session: Record<string, unknown>,
  persona: Record<string, unknown>,
  inventory: ReadonlyMap<string, TableCard>,
): unknown {
  const defense = persona.defense;
  if (defense === undefined || defense === null) return session.zones;
  const zones = session.zones;
  if (
    !isRecord(defense) || !isRecord(zones) || !Array.isArray(zones.hand) ||
    session.active !== "opponent" || session.phase === "mulligan" ||
    typeof persona.nextTicket !== "number" || !Number.isSafeInteger(persona.nextTicket) ||
    persona.nextTicket < 1 || typeof defense.targetKey !== "string"
  ) return null;
  const original = inventory.get(defense.targetKey);
  const zone = CIRCLES.find((circle) =>
    Array.isArray(zones[circle]) && zones[circle].some((card: unknown) =>
      isRecord(card) && card.key === defense.targetKey,
    ),
  );
  const bonus = defense.bonus;
  const remainingTickets = zones.hand.filter((card: unknown) =>
    isRecord(card) && card.ticket === "personaShield",
  ).length;
  const consumedTickets = persona.nextTicket - 1 - remainingTickets;
  if (
    !original || original.crest || original.ticket || !zone ||
    typeof bonus !== "number" || !Number.isSafeInteger(bonus) || bonus < 0 ||
    bonus % 5_000 !== 0 || (bonus > 0 && bonus < 10_000) ||
    Math.ceil(bonus / 15_000) > consumedTickets
  ) return null;
  const cards = zones[zone] as unknown[];
  const target = cards.find((card) => isRecord(card) && card.key === defense.targetKey);
  if (
    !isRecord(target) || target.faceDown !== false || target.crest || target.ticket ||
    typeof target.power !== "number" || !Number.isSafeInteger(target.power) ||
    !Number.isSafeInteger(target.power + bonus)
  ) return null;
  const power = target.power + bonus;
  return {
    ...zones,
    [zone]: cards.map((card) => card === target ? { ...target, power } : card),
  };
}

/** Retire acquisition, crest, defense, and quota state in every saved frame.
 * Existing tickets and manual power remain; only pre-ticket schemas may omit
 * Persona state entirely. Invalid legacy bonuses invalidate that saved frame. */
function migratePersonaState(
  state: unknown,
  copies: readonly TableCard[],
  allowMissing = false,
): unknown {
  if (!isRecord(state) || !isRecord(state.history)) return state;
  const inventory = new Map(copies.map((card) => [card.key, card]));
  function upgrade(session: unknown): unknown {
    if (!isRecord(session)) return session;
    if (session.persona === undefined && allowMissing) {
      return { ...session, persona: emptyPersona() };
    }
    if (!isRecord(session.persona)) return session;
    const zones = migrateLegacyDefense(session, session.persona, inventory);
    if (zones === null) return null;
    return { ...session, zones, persona: { nextTicket: session.persona.nextTicket } };
  }
  return {
    ...state,
    history: {
      ...state.history,
      present: upgrade(state.history.present),
      past: Array.isArray(state.history.past)
        ? state.history.past.map(upgrade)
        : state.history.past,
    },
  };
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

/** Restore auxiliary identity from inventory. A previous G-to-Crest drop hid the
 * unit because Crest only renders crests; return those copies to G face up in every
 * undo frame. All other zones, tokens, and effects retain their saved state. */
function withCardIdentity(
  state: PlaytestState,
  copies: readonly TableCard[],
): PlaytestState {
  const identities = new Map(
    copies
      .filter((card) => card.crest || card.gUnit)
      .map((card) => [card.key, card]),
  );
  if (!identities.size) return state;
  function upgrade(session: TableSession): TableSession {
    const zones = Object.fromEntries(
      (
        Object.entries(session.zones) as [keyof typeof ZONES, TableCard[]][]
      ).map(([zone, cards]) => [
        zone,
        cards.map((card) => {
          const identity = identities.get(card.key);
          return identity
            ? {
                ...card,
                ...(identity.crest ? { crest: true as const } : {}),
                ...(identity.gUnit ? { gUnit: true as const } : {}),
              }
            : card;
        }),
      ]),
    ) as TableSession["zones"];
    const misplacedGUnits = zones.crest.filter((card) => card.gUnit);
    if (misplacedGUnits.length) {
      zones.crest = zones.crest.filter((card) => !card.gUnit);
      zones.g = [
        ...zones.g,
        ...misplacedGUnits.map((card) => ({ ...card, faceDown: false })),
      ];
    }
    return { ...session, zones };
  }
  return {
    ...state,
    history: {
      present: state.history.present ? upgrade(state.history.present) : null,
      past: state.history.past.map(upgrade),
    },
  };
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
      cached = {
        ...cached,
        schema: 2,
        state: migrateRuleState(cached.state),
      };
    }
    if (isRecord(cached) && cached.schema === 2) {
      cached = {
        ...cached,
        schema: SAVE_SCHEMA,
        state: migratePersonaState(cached.state, copies, true),
      };
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
    const state = migratePersonaState(cached.state, copies);
    if (!validState(state, copies)) {
      discard();
      return {
        ...empty,
        notice: "Saved playtest could not be restored. Start a new game.",
      };
    }
    return {
      state: withCardIdentity(state, copies),
      backedUp,
      notice: "",
    };
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
