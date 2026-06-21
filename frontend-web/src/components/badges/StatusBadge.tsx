type StatusBadgeProps = {
  active: boolean;
};

export function StatusBadge({ active }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        active
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          : "border-slate-300/20 bg-slate-300/10 text-slate-300",
      ].join(" ")}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}