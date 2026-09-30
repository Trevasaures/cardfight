import {
  ATTACK_CIRCLES,
  CIRCLES,
  changePower,
  type TableSession,
} from "./playtest.ts";

export const POWER_TARGETS = {
  selected: "Selected units",
  front: "Front row",
  rear: "Rear-guards",
  field: "All units",
} as const;
export type PowerTarget = keyof typeof POWER_TARGETS;
export type PowerMultiplier = "manual" | "gTotal" | "gFaceUp";
export type PowerEffect = {
  target: PowerTarget;
  amount: number;
  multiplier: PowerMultiplier;
  count: number;
};

export function powerTargetKeys(
  session: TableSession,
  target: PowerTarget,
  selected: readonly string[],
): string[] {
  return CIRCLES.flatMap((zone) => {
    if (target === "front" && !ATTACK_CIRCLES.includes(zone)) return [];
    if (target === "rear" && zone === "vanguard") return [];
    return session.zones[zone]
      .filter((card) => target !== "selected" || selected.includes(card.key))
      .map((card) => card.key);
  });
}

export function powerMultiplierCount(
  session: TableSession,
  multiplier: PowerMultiplier,
  manualCount: number,
): number {
  if (multiplier === "gTotal") return session.zones.g.length;
  if (multiplier === "gFaceUp")
    return session.zones.g.filter((card) => !card.faceDown).length;
  return manualCount;
}

export function powerEffectAmount(amount: number, count: number): number | null {
  const total = amount * count;
  return Number.isSafeInteger(amount) &&
    Number.isSafeInteger(count) &&
    count > 0 &&
    Number.isSafeInteger(total) &&
    total !== 0
    ? total
    : null;
}

/** Resolve targets/count now; future calls and G-zone changes don't reapply this effect. */
export function applyPowerEffect(
  session: TableSession,
  selected: readonly string[],
  effect: PowerEffect,
): TableSession {
  const count = powerMultiplierCount(session, effect.multiplier, effect.count);
  const amount = powerEffectAmount(effect.amount, count);
  return amount === null
    ? session
    : changePower(
        session,
        powerTargetKeys(session, effect.target, selected),
        amount,
      );
}
