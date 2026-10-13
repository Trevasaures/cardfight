import type { DeckCardEntry } from "../../types/api.ts";
import type { RuleContext } from "./rules/types.ts";
import {
  findCard,
  moveCards,
  type TableCard,
  type TableSession,
} from "./playtest.ts";

/** Untyped older lists can identify G units by their saved deck section. */
export function isGUnitEntry(entry: DeckCardEntry | undefined): boolean {
  if (!entry?.card) return false;
  const type = entry.card.card_type?.trim().toLowerCase();
  return type === "g unit" || (!type && entry.zone === "g");
}

export function isGUnit(card: TableCard, entry?: DeckCardEntry): boolean {
  return !card.crest && Boolean(card.gUnit || isGUnitEntry(entry));
}

/** Old manually moved G vanguards lack an association; their immediate normal
 * predecessor is the only safe heart fallback. Never pick an arbitrary soul card. */
export function strideHeartKey(session: TableSession): string | undefined {
  const vanguard = session.zones.vanguard[0];
  if (!vanguard?.gUnit) return undefined;
  // Explicit null means a new/manual placement with no associated heart. Only
  // snapshots predating stride metadata may infer their immediate predecessor.
  if (session.stride === null) return undefined;
  if (session.stride) {
    if (session.stride.gUnitKey !== vanguard.key) return undefined;
    const heart = session.zones.soul.find(
      (card) => card.key === session.stride?.heartKey,
    );
    return heart && !heart.gUnit && !heart.crest ? heart.key : undefined;
  }
  const top = session.zones.soul.at(-1);
  return top && !top.gUnit && !top.crest ? top.key : undefined;
}

export function heartCard(context: RuleContext): TableCard | undefined {
  const key = strideHeartKey(context.session);
  return context.session.zones.soul.find((card) => card.key === key);
}

/** Hearts share the visual stack but cannot pay soul costs. */
export function soulCards(session: TableSession): TableCard[] {
  const heartKey = strideHeartKey(session);
  return session.zones.soul.filter((card) => card.key !== heartKey);
}

export function generationBreak(context: RuleContext) {
  const counts = (card: TableCard) =>
    !card.faceDown && isGUnit(card, context.entries.get(card.entryId));
  const gFaceUp = context.session.zones.g.filter(counts).length;
  const vanguardG = context.session.zones.vanguard.filter(counts).length;
  return { gFaceUp, vanguardG, total: gFaceUp + vanguardG };
}

/** Normal stride uses a face-down G unit during Ride. The solo sandbox also
 * accepts Main and face-up copies so a missed step or accidental cost flip is
 * recoverable. Opponent grades, costs, and card-specific permissions stay manual. */
export function canStride(context: RuleContext, key: string): boolean {
  const { session, entries } = context;
  const chosen = session.zones.g.find((card) => card.key === key);
  const vanguard = session.zones.vanguard[0];
  return Boolean(
    session.active === "you" &&
    (session.phase === "ride" || session.phase === "main") &&
    !session.check &&
    !session.rules.pending.length &&
    !session.stride &&
    chosen &&
    isGUnit(chosen, entries.get(chosen.entryId)) &&
    vanguard &&
    !vanguard.crest &&
    !vanguard.faceDown &&
    !isGUnit(vanguard, entries.get(vanguard.entryId)) &&
    (entries.get(vanguard.entryId)?.card?.grade ?? -1) >= 3,
  );
}

export function stride(context: RuleContext, key: string): TableSession {
  if (!canStride(context, key)) return context.session;
  const { session, entries } = context;
  const heart = session.zones.vanguard[0];
  const next = moveCards(session, [key], "vanguard");
  const unit = next.zones.vanguard[0];
  // Heart inheritance uses printed power, not bonuses previously given to the unit.
  const heartPower = entries.get(heart.entryId)?.card?.power ?? 0;
  return {
    ...next,
    stride: { gUnitKey: key, heartKey: heart.key },
    zones: {
      ...next.zones,
      vanguard: [
        { ...unit, gUnit: true, rested: heart.rested, power: heartPower },
      ],
    },
    log: [...session.log.slice(-39), "Stride · heart retained."],
  };
}

export function canTurnFaceUpGUnits(
  context: RuleContext,
  keys: readonly string[],
): boolean {
  const { session, entries } = context;
  if (session.phase === "mulligan" || !keys.length) return false;
  const chosen = [...new Set(keys)].map((key) =>
    session.zones.g.find((card) => card.key === key),
  );
  return (
    chosen.every((card) => card && isGUnit(card, entries.get(card.entryId))) &&
    chosen.some((card) => card?.faceDown)
  );
}

/** A cost turns chosen G units face up once; it never toggles used cards back down. */
export function turnFaceUpGUnits(
  context: RuleContext,
  keys: readonly string[],
): TableSession {
  if (!canTurnFaceUpGUnits(context, keys)) return context.session;
  const { session } = context;
  const selected = new Set(keys);
  const count = session.zones.g.filter(
    (card) => selected.has(card.key) && card.faceDown,
  ).length;
  return {
    ...session,
    zones: {
      ...session.zones,
      g: session.zones.g.map((card) =>
        selected.has(card.key)
          ? { ...card, gUnit: true, faceDown: false }
          : card,
      ),
    },
    log: [
      ...session.log.slice(-39),
      `Turned ${count} G unit${count === 1 ? "" : "s"} face up.`,
    ],
  };
}

/** The physical G area accepts either an in-place cost flip or the return of the
 * current G vanguard. Validate every selected copy before applying either action. */
export function canDropInGZone(
  context: RuleContext,
  keys: readonly string[],
): boolean {
  const { session, entries } = context;
  if (session.phase === "mulligan" || !keys.length) return false;
  const chosen = [...new Set(keys)].map((key) => findCard(session, key));
  if (
    chosen.some(
      (found) =>
        !found ||
        !isGUnit(found.card, entries.get(found.card.entryId)) ||
        (found.zone !== "g" && found.zone !== "vanguard"),
    )
  )
    return false;
  const returningVanguard = chosen.some((found) => found?.zone === "vanguard");
  if (
    returningVanguard &&
    (chosen.length !== 1 ||
      session.active !== "you" ||
      session.check ||
      session.rules.pending.length)
  )
    return false;
  return returningVanguard || chosen.some((found) => found?.card.faceDown);
}

/** Dropping into G never toggles a used card down or temporarily moves a cost
 * copy to another zone. Return and cost are separate actions, so a cost selection
 * cannot accidentally end the stride. Undo restores the prior heart/face-up count. */
export function dropInGZone(
  context: RuleContext,
  keys: readonly string[],
): TableSession {
  if (!canDropInGZone(context, keys)) return context.session;
  const { session, entries } = context;
  const selected = new Set(keys);
  const vanguard = session.zones.vanguard[0];
  let next = session;
  if (vanguard && selected.has(vanguard.key)) {
    // Current metadata supplies identity for a legacy copy before its first save.
    next = returnStridingVanguard({
      ...session,
      zones: {
        ...session.zones,
        vanguard: [{ ...vanguard, gUnit: true }],
      },
    });
  }
  const costKeys = session.zones.g
    .filter((card) => selected.has(card.key))
    .map((card) => card.key);
  return turnFaceUpGUnits({ session: next, entries }, costKeys);
}

/** Returning a G vanguard restores its associated heart in the same orientation.
 * No soul fallback means an empty vanguard, rather than inventing or duplicating a card. */
export function returnStridingVanguard(session: TableSession): TableSession {
  const unit = session.zones.vanguard[0];
  if (!unit?.gUnit) return session;
  const heartKey = strideHeartKey(session);
  const heart = session.zones.soul.find((card) => card.key === heartKey);
  const clean = (card: TableCard): TableCard => ({
    ...card,
    rested: false,
    faceDown: false,
    power: 0,
    critical: 0,
  });
  return {
    ...session,
    stride: null,
    attackerKey: session.attackerKey === unit.key ? null : session.attackerKey,
    zones: {
      ...session.zones,
      vanguard: heart ? [{ ...clean(heart), rested: unit.rested }] : [],
      soul: session.zones.soul.filter((card) => card.key !== heartKey),
      g: [...session.zones.g, clean(unit)],
    },
    log: [
      ...session.log.slice(-39),
      "G unit returned face up · heart restored.",
    ],
  };
}
