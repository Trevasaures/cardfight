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
      required: summary.required + item.target_quantity,
      owned: summary.owned + item.available_quantity,
      outgoing: summary.outgoing + item.removed_quantity,
      incoming: summary.incoming + item.ordered_quantity,
      accounted: summary.accounted + item.accounted_quantity,
      missing: summary.missing + item.missing_quantity,
      estimatedCost: summary.estimatedCost + item.estimated_cost_cents,
      remainingCost: summary.remainingCost + item.remaining_cost_cents,
    }),
    {
      required: 0,
      owned: 0,
      outgoing: 0,
      incoming: 0,
      accounted: 0,
      missing: 0,
      estimatedCost: 0,
      remainingCost: 0,
    },
  );
  const complete = totals.missing === 0;
  const progress = totals.required
    ? Math.min(100, Math.round((totals.accounted / totals.required) * 100))
    : complete
      ? 100
      : 0;
  const gradeLabel = grade === null ? "Unknown grade" : `Grade ${grade}`;

  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/15"
    >
      <summary className="cursor-pointer list-none bg-white/[0.025] px-3 py-3 select-none transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-300/60 sm:px-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={[
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black",
                complete
                  ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                  : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
              ].join(" ")}
            >
              {grade === null ? "G?" : `G${grade}`}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-slate-100">{gradeLabel}</h4>
                {complete ? (
                  <span
                    title={
                      totals.incoming > 0
                        ? "Every planned copy is on hand or incoming."
                        : "Every planned copy is on hand."
                    }
                    className="inline-flex items-center gap-1 text-[0.65rem] font-bold text-emerald-200/90"
                  >
                    <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                    {totals.incoming > 0 ? "All copies covered" : "Ready"}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[0.65rem] text-slate-500">
                {items.length} printing{items.length === 1 ? "" : "s"} ·{" "}
                {totals.required} planned
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.08em] text-slate-500">
                Purchase estimate
              </p>
              <p className="mt-0.5 text-sm font-black tabular-nums text-slate-100">
                {dollars(totals.estimatedCost)}
              </p>
            </div>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.65rem]">
          <span className="text-slate-400">
            Ready{" "}
            <strong className="tabular-nums text-emerald-200">{totals.owned}</strong>
          </span>
          {totals.outgoing ? (
            <span className="text-slate-400">
              Outgoing{" "}
              <strong className="tabular-nums text-rose-200">{totals.outgoing}</strong>
            </span>
          ) : null}
          <span className="text-slate-400">
            Incoming{" "}
            <strong className="tabular-nums text-violet-200">{totals.incoming}</strong>
          </span>
          <span className="text-slate-400">
            Missing{" "}
            <strong
              className={
                totals.missing
                  ? "tabular-nums text-rose-200"
                  : "tabular-nums text-emerald-200"
              }
            >
              {totals.missing}
            </strong>
          </span>
          {totals.remainingCost > 0 ? (
            <span className="text-slate-400">
              Not yet incoming{" "}
              <strong className="tabular-nums text-rose-200">
                {dollars(totals.remainingCost)}
              </strong>
            </span>
          ) : null}
          <span
            className="ml-auto font-bold tabular-nums text-slate-500"
            title="Planned copies covered by on-hand and incoming quantities"
          >
            {progress}% covered
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`${gradeLabel} copies covered`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]"
        >
          <div
            className={[
              "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
              complete ? "bg-emerald-300" : "bg-cyan-300",
            ].join(" ")}
            style={{ width: `${progress}%` }}
          />
        </div>
      </summary>

      <div className="border-t border-white/10 p-2.5 sm:p-3">
        {items.length ? (
          <div className="grid min-w-0 gap-2.5">
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
