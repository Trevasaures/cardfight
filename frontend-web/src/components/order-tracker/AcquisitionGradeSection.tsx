import { CheckCircle2, ChevronDown, PackageOpen } from "lucide-react";

import { AcquisitionItemRow } from "./AcquisitionItemRow";
import type {
  AcquisitionPlanItem,
  UpdateAcquisitionItemPayload,
} from "../../types/api";

type AcquisitionGradeSectionProps = {
  grade: number | null;
  items: AcquisitionPlanItem[];
  busyItemId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    itemId: number,
    payload: UpdateAcquisitionItemPayload,
  ) => Promise<void>;
  onReceive: (itemId: number, quantity: number) => Promise<void>;
  onRemove: (item: AcquisitionPlanItem) => Promise<void>;
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function AcquisitionGradeSection({
  grade,
  items,
  busyItemId,
  open,
  onOpenChange,
  onSave,
  onReceive,
  onRemove,
}: AcquisitionGradeSectionProps) {
  const totals = items.reduce(
    (summary, item) => ({
      required: summary.required + item.required_quantity,
      owned: summary.owned + item.owned_quantity,
      incoming: summary.incoming + item.ordered_quantity,
      accounted: summary.accounted + item.accounted_quantity,
      missing: summary.missing + item.missing_quantity,
      remainingCost: summary.remainingCost + item.remaining_cost_cents,
    }),
    {
      required: 0,
      owned: 0,
      incoming: 0,
      accounted: 0,
      missing: 0,
      remainingCost: 0,
    },
  );
  const progress = totals.required
    ? Math.min(100, Math.round((totals.accounted / totals.required) * 100))
    : 0;
  const complete = totals.missing === 0;
  const gradeLabel = grade === null ? "Unknown grade" : `Grade ${grade}`;

  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/15"
    >
      <summary className="cursor-pointer list-none bg-white/[0.035] p-4 select-none sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={[
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-black",
                complete
                  ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                  : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
              ].join(" ")}
            >
              {grade === null ? "G?" : `G${grade}`}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-black text-slate-100">{gradeLabel}</h4>
                {complete ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[0.7rem] font-bold text-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accounted for
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {items.length} printing{items.length === 1 ? "" : "s"} ·{" "}
                {totals.required} required
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-xs">
            <span className="text-slate-500">
              Owned{" "}
              <strong className="text-slate-200">{totals.owned}</strong>
            </span>
            <span className="text-slate-500">
              Incoming{" "}
              <strong className="text-violet-200">{totals.incoming}</strong>
            </span>
            <span className="text-slate-500">
              Missing{" "}
              <strong
                className={
                  totals.missing ? "text-rose-200" : "text-emerald-200"
                }
              >
                {totals.missing}
              </strong>
            </span>
            <span className="text-slate-500">
              Estimate{" "}
              <strong className="text-slate-200">
                {dollars(totals.remainingCost)}
              </strong>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={[
                "h-full rounded-full transition-[width]",
                complete ? "bg-emerald-300" : "bg-cyan-300",
              ].join(" ")}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs font-black text-slate-400">
            {progress}%
          </span>
        </div>
      </summary>

      <div className="border-t border-white/10 p-3 sm:p-4">
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item) => (
              <AcquisitionItemRow
                key={`${item.id}-${item.updated_at}`}
                item={item}
                busy={busyItemId === item.id}
                onSave={onSave}
                onReceive={onReceive}
                onRemove={onRemove}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-500">
            <PackageOpen className="h-4 w-4" />
            No cards in this grade.
          </div>
        )}
      </div>
    </details>
  );
}
