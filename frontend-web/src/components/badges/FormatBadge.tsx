import type { DeckType } from "../../types/api";

type FormatBadgeProps = {
  type: DeckType | "Any" | null | undefined;
};

export function FormatBadge({ type }: FormatBadgeProps) {
  const label = type ?? "Unknown";

  const className =
    label === "Stride"
      ? "border-violet-300/30 bg-violet-300/10 text-violet-100"
      : label === "Standard"
        ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
        : "border-slate-300/20 bg-slate-300/10 text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}