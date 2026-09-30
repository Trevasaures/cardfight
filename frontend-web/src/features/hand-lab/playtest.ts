import { emptyRules, type RuleState } from "./rules/types.ts";
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
  gauge: "AutoMOD",
} as const;
export type Zone = keyof typeof ZONES;
export const ATTACK_CIRCLES: readonly Zone[] = [
  "frontLeft",
  "vanguard",
  "frontRight",
];
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
  | "power+2k"
  | "power-2k"
  | "power+100m"
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
  rules: RuleState;
  attackerKey: string | null;
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
    // Unused G units start face down; face-up counts can then drive manual bonuses.
    zones[zone].push(zone === "g" ? { ...copy, faceDown: true } : copy);
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
    rules: emptyRules(),
    attackerKey: null,
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

  // Soul is stored bottom-to-top. Uncover the next card only when the current
  // vanguard leaves, before inserting the outgoing card (which may itself enter soul).
  // Removing several cards at once skips every selected copy in the stack.
  if (
    to !== "vanguard" &&
    session.zones.vanguard.some((card) => moved.has(card.key))
  ) {
    const uncovered = zones.soul.at(-1);
    if (uncovered) {
      zones.soul = zones.soul.slice(0, -1);
      zones.vanguard = [fresh(uncovered)];
    }
  }
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
  // Charged or manually added soul goes beneath the existing stack. Only riding
  // puts the former vanguard immediately under its replacement.
  zones[to] =
    to === "soul" || position === "top"
      ? [...cards, ...zones[to]]
      : [...zones[to], ...cards];
  return record(
    {
      ...session,
      zones,
      // A retired or removed attacker must not own the next drive check.
      attackerKey: ATTACK_CIRCLES.some((zone) =>
        zones[zone].some((card) => card.key === session.attackerKey),
      )
        ? session.attackerKey
        : null,
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

/** Apply one additive bonus atomically, including multi-unit effects and undo. */
export function changePower(
  session: TableSession,
  keys: readonly string[],
  amount: number,
): TableSession {
  if (session.phase === "mulligan" || !Number.isSafeInteger(amount) || !amount)
    return session;
  const targets = [...new Set(keys)].flatMap((key) => {
    const found = findCard(session, key);
    return found ? [found.card] : [];
  });
  if (
    !targets.length ||
    targets.some((card) => !Number.isSafeInteger(card.power + amount))
  )
    return session;

  const selected = new Set(targets.map((card) => card.key));
  const zones = { ...session.zones };
  for (const zone of Object.keys(ZONES) as Zone[])
    zones[zone] = zones[zone].map((card) =>
      selected.has(card.key) ? { ...card, power: card.power + amount } : card,
    );
  return record(
    { ...session, zones },
    `${amount > 0 ? "+" : ""}${amount.toLocaleString()} power · ${targets.length} ${targets.length === 1 ? "card" : "cards"}.`,
  );
}

export function changeCards(
  session: TableSession,
  keys: readonly string[],
  change: CardChange,
): TableSession {
  // Presets and custom/group effects share the same integer validation and update.
  switch (change) {
    case "power+":
      return changePower(session, keys, 5000);
    case "power-":
      return changePower(session, keys, -5000);
    case "power+2k":
      return changePower(session, keys, 2000);
    case "power-2k":
      return changePower(session, keys, -2000);
    case "power+100m":
      return changePower(session, keys, 100_000_000);
  }
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
  limit = 10,
): TableSession {
  if (
    session.phase === "mulligan" || !Number.isSafeInteger(delta) ||
    ![10, 15].includes(limit)
  ) return session;
  const energy = Math.min(limit, Math.max(0, session.energy + delta));
  return energy === session.energy
    ? session
    : record({ ...session, energy }, `Energy ${energy}.`);
}

export function canAttack(session: TableSession, key: string): boolean {
  const found = findCard(session, key);
  return Boolean(
    session.active === "you" &&
      session.phase === "battle" &&
      !session.check &&
      found &&
      ATTACK_CIRCLES.includes(found.zone) &&
      !found.card.rested &&
      !found.card.faceDown,
  );
}

/** Rest explicitly, rather than toggling: extra drive checks must never stand a unit. */
function restAttacker(session: TableSession, key: string): TableSession {
  const { zone } = findCard(session, key)!;
  return {
    ...session,
    attackerKey: key,
    zones: {
      ...session.zones,
      [zone]: session.zones[zone].map((card) =>
        card.key === key ? { ...card, rested: true } : card,
      ),
    },
  };
}

export function attackCard(session: TableSession, key: string): TableSession {
  if (!canAttack(session, key)) return session;
  const { zone } = findCard(session, key)!;
  // Checks remain separate so on-attack effects can be resolved before revealing a card.
  return record(restAttacker(session, key), `Attack · ${ZONES[zone]}.`);
}

export function getDriveAttacker(
  session: TableSession,
  key = session.attackerKey ?? session.zones.vanguard[0]?.key,
): { card: TableCard; zone: Zone } | undefined {
  const found = key ? findCard(session, key) : undefined;
  return found && ATTACK_CIRCLES.includes(found.zone) && !found.card.faceDown
    ? found
    : undefined;
}

export function beginCheck(
  session: TableSession,
  kind: "drive" | "damage",
  attackerKey?: string,
): TableSession {
  // Leave the revealed card pending while the player applies its effects manually.
  if (
    session.phase === "mulligan" ||
    session.check ||
    session.rules.pending.length > 0 ||
    !session.zones.deck.length
  )
    return session;
  let next = session;
  if (kind === "drive") {
    if (session.active !== "you" || session.phase !== "battle") return session;
    const attacker = getDriveAttacker(session, attackerKey);
    if (!attacker) return session;
    // Remember the source across repeated checks, including manual rear-guard checks.
    next = restAttacker(session, attacker.card.key);
  }
  const key = session.zones.deck[0].key;
  return record(
    { ...takeTop(next, "reveal"), check: { key, kind } },
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
  // Resolve checks and queued abilities before advancing past their turn.
  if (
    session.phase === "mulligan" || session.check || session.rules.pending.length
  ) return session;
  if (session.active === "opponent") {
    // The opponent has no simulated field; this transition starts the next solo turn.
    const zones = { ...session.zones };
    // Damage-trigger bonuses expire at the opponent's turn boundary as well.
    for (const zone of Object.keys(ZONES) as Zone[])
      zones[zone] = zones[zone].map((card) => ({
        ...card,
        power: 0,
        critical: 0,
        rested: CIRCLES.includes(zone) ? false : card.rested,
      }));
    return record(
      {
        ...session,
        zones,
        active: "you",
        turn: session.turn + 1,
        phase: "stand",
        attackerKey: null,
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
      { ...session, zones, active: "opponent", attackerKey: null },
      "Opponent's turn. Cleared turn bonuses.",
    );
  }
  let phase = PHASES[PHASES.indexOf(session.phase) + 1];
  // Both starting orders draw, but the first player skips their first battle phase.
  if (phase === "battle" && session.first && session.turn === 1) phase = "end";
  const next = { ...session, phase, attackerKey: null };
  return record(
    phase === "draw" ? takeTop(next, "hand") : next,
    `${phase[0].toUpperCase()}${phase.slice(1)} phase${phase === "draw" && !session.zones.deck.length ? " · deck empty" : ""}.`,
  );
}
