import type { TableCard } from "./playtest";

/** Missing catalog stats still allow displaying the player's manual power bonus. */
export function formatPower(
  card: TableCard,
  basePower: number | null | undefined,
  compact = false,
): string {
  const value = (basePower ?? 0) + card.power;
  const display =
    compact && Math.abs(value) >= 1_000_000
      ? new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 3,
        }).format(value)
      : value.toLocaleString();
  if (basePower != null) return display;
  if (!card.power) return "—";
  return `${card.power > 0 ? "+" : ""}${display}`;
}
