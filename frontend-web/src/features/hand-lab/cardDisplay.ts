import type { TableCard } from "./playtest";

const compactPowerFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 3,
});

/** Missing catalog stats still allow displaying the player's manual power bonus. */
export function formatPower(
  card: TableCard,
  basePower: number | null | undefined,
  compact = false,
): string {
  const bonus = card.power;
  const value = (basePower ?? 0) + bonus;
  const display =
    compact && Math.abs(value) >= 1_000_000
      ? compactPowerFormatter.format(value)
      : value.toLocaleString();
  if (basePower != null) return display;
  if (!bonus) return "—";
  return `${bonus > 0 ? "+" : ""}${display}`;
}
