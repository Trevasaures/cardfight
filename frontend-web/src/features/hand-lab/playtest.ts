import type { DeckCardEntry } from "../../types/api.ts";
import {
  dealHand,
  mulligan,
  shuffle,
  type CardCopy,
  type Random,
} from "./engine.ts";

// Table operations return new snapshots without changing saved deck records.
// An unchanged reference means the action was ignored, so it adds no undo step.

export const ZONES = {
  deck: "Deck",
  ride: "Ride deck",
  hand: "Hand",
  vanguard: "Vanguard",
  frontLeft: "Front left",
  frontRight: "Front right",
  backLeft: "Back left",
  backCenter: "Back center",
  backRight: "Back right",
  guardian: "Guardian",
  soul: "Soul",
  damage: "Damage",
  drop: "Drop",
  order: "Order",
  crest: "Crest",
  bind: "Bind",
  g: "G zone",
  token: "Tokens",
  reserve: "Reserve",
  reveal: "Reveal",
} as const;
export type Zone = keyof typeof ZONES;
export const CIRCLES: Zone[] = [
  "frontLeft",
  "vanguard",
  "frontRight",
  "backLeft",
  "backCenter",
  "backRight",
];
export type TableCard = CardCopy & {
  rested: boolean;
  faceDown: boolean;
  power: number;
  critical: number;
};
export type CardChange =
  | "rest"
  | "flip"
  | "power+"
  | "power-"
  | "critical+"
  | "critical-";
export type Phase =
  | "mulligan"
  | "stand"
  | "draw"
  | "ride"
  | "main"
  | "battle"
  | "end";
export const PHASES: Phase[] = [
  "stand",
  "draw",
  "ride",
  "main",
  "battle",
  "end",
];
export type TableSession = {
  zones: Record<Zone, TableCard[]>;
  first: boolean;
  turn: number;
  active: "you" | "opponent";
  phase: Phase;
  energy: number;
  check: { key: string; kind: "drive" | "damage" } | null;
  log: string[];
};

function fresh(card: CardCopy): TableCard {
  return { ...card, rested: false, faceDown: false, power: 0, critical: 0 };
}

export function listCopies(entries: readonly DeckCardEntry[]): TableCard[] {
  // Expand quantities into stable copy keys; moving one copy must not move its siblings.
  return entries.flatMap((entry) => {
    if (
      !entry.card ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1
    ) {
      throw new Error(
        "This list has an unavailable card or invalid quantity. Update it in Deck Builder.",
      );
    }
    return Array.from({ length: entry.quantity }, (_, index) =>
      fresh({
        key: `${entry.id}:${index}`,
        cardId: entry.card_id,
        entryId: entry.id,
      }),
    );
  });
}

function record(session: TableSession, message: string): TableSession {
  return { ...session, log: [...session.log.slice(-39), message] };
}

export function startTable(
  entries: readonly DeckCardEntry[],
  first: boolean,
  starterKey: string | null,
  random: Random = Math.random,
): TableSession {
  const zones = Object.fromEntries(
    Object.keys(ZONES).map((key) => [key, []]),
  ) as unknown as TableSession["zones"];
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  for (const copy of listCopies(entries)) {
    const entry = entryMap.get(copy.entryId)!;
    const zone =
      entry.zone === "main"
        ? "deck"
        : entry.zone === "other"
          ? "reserve"
          : entry.zone;
    zones[zone].push(copy);
  }
  if (starterKey) {
    // Set the starter aside before dealing so it cannot also appear in the hand.
    const source = (["ride", "deck"] as const).find((zone) =>
      zones[zone].some((card) => card.key === starterKey),
    );
    const starter =
      source && zones[source].find((card) => card.key === starterKey);
    if (!source || !starter || entryMap.get(starter.entryId)?.card?.grade !== 0)
      throw new Error("Choose a grade 0 starter from the main or ride deck.");
    zones[source] = zones[source].filter((card) => card.key !== starterKey);
    zones.vanguard = [starter];
  }
  const opening = dealHand(zones.deck, random);
  zones.hand = opening.hand.map(fresh);
  zones.deck = opening.deck.map(fresh);
  return {
    zones,
    first,
    turn: 0,
    active: first ? "you" : "opponent",
    phase: "mulligan",
    energy: 0,
    check: null,
    log: ["Dealt five."],
  };
}

export function finishMulligan(
  session: TableSession,
  keys: string[],
  random: Random = Math.random,
): TableSession {
  if (session.phase !== "mulligan") return session;
  const opening = mulligan(
    {
      hand: session.zones.hand,
      deck: session.zones.deck,
      discard: [],
      phase: "mulligan",
      draws: 0,
    },
    keys,
    random,
  );
  const count = session.zones.hand.filter((card) =>
    keys.includes(card.key),
  ).length;
  return record(
    {
      ...session,
      phase: "stand",
      turn: session.first ? 1 : 0,
      zones: {
        ...session.zones,
        hand: opening.hand.map(fresh),
        deck: opening.deck.map(fresh),
      },
    },
    `${count ? `Replaced ${count}.` : "Kept hand."} ${session.first ? "Your turn 1." : "Opponent's turn."}`,
  );
}

export function findCard(
  session: TableSession,
  key: string,
): { card: TableCard; zone: Zone } | undefined {
  for (const zone of Object.keys(ZONES) as Zone[]) {
    const card = session.zones[zone].find((copy) => copy.key === key);
    if (card) return { card, zone };
  }
}

export function canDropCards(
  session: TableSession,
  keys: readonly string[],
  to: Zone,
): boolean {
  if (session.phase === "mulligan" || !keys.length) return false;
  const cards = [...new Set(keys)].map((key) => findCard(session, key));
  if (
    cards.some((card) => !card) ||
    (CIRCLES.includes(to) && cards.length !== 1)
  )
    return false;
  return cards.some((card) => card!.zone !== to || to === "deck");
}

export function moveCards(
  session: TableSession,
  keys: readonly string[],
  to: Zone,
  position: "top" | "bottom" = "bottom",
): TableSession {
  if (session.phase === "mulligan") return session;
  const selected = [...new Set(keys)].flatMap((key) => {
    const found = findCard(session, key);
    return found && (found.zone !== to || to === "deck") ? [found.card] : [];
  });
  if (!selected.length || (CIRCLES.includes(to) && selected.length !== 1))
    return session;
  const moved = new Set(selected.map((card) => card.key));
  const zones = { ...session.zones };
  // Remove each physical copy everywhere before inserting it at its destination.
  for (const zone of Object.keys(ZONES) as Zone[])
    zones[zone] = zones[zone].filter((card) => !moved.has(card.key));
  if (CIRCLES.includes(to)) {
    // Riding keeps the previous vanguard in soul; calling over a rear-guard retires it.
    const replaced = zones[to];
    const destination = to === "vanguard" ? "soul" : "drop";
    zones[destination] = [...zones[destination], ...replaced.map(fresh)];
    zones[to] = [];
  }
  const cards = selected.map((card) => {
    const from = findCard(session, card.key)!.zone;
    // Rear-guard movement keeps rest/bonuses. Entering another zone resets that state.
    return CIRCLES.includes(from) &&
      CIRCLES.includes(to) &&
      from !== "vanguard" &&
      to !== "vanguard"
      ? card
      : fresh(card);
  });
  zones[to] =
    position === "top" ? [...cards, ...zones[to]] : [...zones[to], ...cards];
  return record(
    {
      ...session,
      zones,
      check:
        session.check && moved.has(session.check.key) ? null : session.check,
    },
    `${cards.length} → ${ZONES[to]}${to === "deck" ? ` (${position})` : ""}.`,
  );
}

export function takeTop(session: TableSession, to: Zone): TableSession {
  const top = session.zones.deck[0];
  return top ? moveCards(session, [top.key], to) : session;
}

export function shuffleDeck(
  session: TableSession,
  random: Random = Math.random,
): TableSession {
  if (session.phase === "mulligan" || session.zones.deck.length < 2)
    return session;
  return record(
    {
      ...session,
      zones: { ...session.zones, deck: shuffle(session.zones.deck, random) },
    },
    "Shuffled deck.",
  );
}

export function changeCards(
  session: TableSession,
  keys: readonly string[],
  change: CardChange,
): TableSession {
  if (
    session.phase === "mulligan" ||
    !keys.some((key) => findCard(session, key))
  )
    return session;
  const selected = new Set(keys);
  const zones = { ...session.zones };
  for (const zone of Object.keys(ZONES) as Zone[])
    zones[zone] = zones[zone].map((card) => {
      if (!selected.has(card.key)) return card;
      switch (change) {
        case "rest":
          return { ...card, rested: !card.rested };
        case "flip":
          return { ...card, faceDown: !card.faceDown };
        case "power+":
          return { ...card, power: card.power + 5000 };
        case "power-":
          return { ...card, power: card.power - 5000 };
        case "critical+":
          return { ...card, critical: card.critical + 1 };
        case "critical-":
          return { ...card, critical: card.critical - 1 };
      }
    });
  return record({ ...session, zones }, `${keys.length} selected · ${change}.`);
}

export function changeEnergy(
  session: TableSession,
  delta: number,
): TableSession {
  if (session.phase === "mulligan") return session;
  const energy = Math.min(10, Math.max(0, session.energy + delta));
  return energy === session.energy
    ? session
    : record({ ...session, energy }, `Energy ${energy}.`);
}

export function beginCheck(
  session: TableSession,
  kind: "drive" | "damage",
): TableSession {
  // Leave the revealed card pending while the player applies its effects manually.
  if (
    session.phase === "mulligan" ||
    session.check ||
    !session.zones.deck.length
  )
    return session;
  const key = session.zones.deck[0].key;
  return record(
    { ...takeTop(session, "reveal"), check: { key, kind } },
    `${kind === "drive" ? "Drive" : "Damage"} check.`,
  );
}

export function resolveCheck(session: TableSession): TableSession {
  return session.check
    ? moveCards(
        session,
        [session.check.key],
        session.check.kind === "drive" ? "hand" : "damage",
      )
    : session;
}

export function nextPhase(session: TableSession): TableSession {
  // A pending check must be resolved before progressing the turn.
  if (session.phase === "mulligan" || session.check) return session;
  if (session.active === "opponent") {
    // The opponent has no simulated field; this transition starts the next solo turn.
    const zones = { ...session.zones };
    for (const zone of CIRCLES)
      zones[zone] = zones[zone].map((card) => ({ ...card, rested: false }));
    return record(
      {
        ...session,
        zones,
        active: "you",
        turn: session.turn + 1,
        phase: "stand",
      },
      `Your turn ${session.turn + 1}. Stood units.`,
    );
  }
  if (session.phase === "end") {
    const zones = { ...session.zones };
    for (const zone of Object.keys(ZONES) as Zone[])
      zones[zone] = zones[zone].map((card) => ({
        ...card,
        power: 0,
        critical: 0,
      }));
    return record(
      { ...session, zones, active: "opponent" },
      "Opponent's turn. Cleared turn bonuses.",
    );
  }
  let phase = PHASES[PHASES.indexOf(session.phase) + 1];
  // Both starting orders draw, but the first player skips their first battle phase.
  if (phase === "battle" && session.first && session.turn === 1) phase = "end";
  const next = { ...session, phase };
  return record(
    phase === "draw" ? takeTop(next, "hand") : next,
    `${phase[0].toUpperCase()}${phase.slice(1)} phase${phase === "draw" && !session.zones.deck.length ? " · deck empty" : ""}.`,
  );
}
