import type { Random } from "./engine.ts";

export type TurnOrder = "first" | "second" | "random";

export function normalizeTurnOrder(value: unknown): TurnOrder {
  return value === "first" || value === "second" ? value : "random";
}

/** Resolve once when dealing; the game stores the resulting boolean thereafter. */
export function resolveTurnOrder(
  order: TurnOrder,
  random: Random = Math.random,
): boolean {
  if (order === "first") return true;
  if (order === "second") return false;
  return random() < 0.5;
}

export function startingOrderLabel(first: boolean): string {
  return first ? "Going first" : "Going second";
}
