import {
  Archive,
  CheckCircle2,
  ChevronDown,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import type {
  AcquisitionBuildMode,
  AcquisitionPlan,
  AcquisitionPlanStatus,
} from "../../types/api";
import { formatUsdCents } from "../../utils/format";

const STATUS_LABELS: Record<AcquisitionPlanStatus, string> = {
  planning: "Planning",
  buying: "Buying",
  waiting: "Waiting",
  complete: "Complete",
  paused: "Paused",
};
const BUILD_LABELS: Record<AcquisitionBuildMode, string> = {
  physical: "Physical build",
  proxy: "Proxy build",
  mixed: "Mixed physical/proxy",
};
const fieldClass = "workspace-control w-full";
const labelClass = "collection-label";

type Props = {
  plans: AcquisitionPlan[];
  plan: AcquisitionPlan;
  loading: boolean;
  saving: boolean;
  onChange: (plan: AcquisitionPlan) => void;
  onDiscard: () => void;
  hasRowDrafts?: boolean;
  onRefresh: () => void;
  onSave: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onRestore: () => void;
};

export function PurchasePlanWorkspace({
  plans,
  plan,
  loading,
  saving,
  onChange,
  onDiscard,
  hasRowDrafts = false,
  onRefresh,
  onSave,
  onDelete,
  onArchive,
  onRestore,
}: Props) {
  const { summary } = plan;
  const savedPlan = plans.find((row) => row.id === plan.id);
  const dirty = Boolean(
    savedPlan &&
    (savedPlan.name !== plan.name ||
      savedPlan.notes !== plan.notes ||
      savedPlan.status !== plan.status ||
      savedPlan.build_mode !== plan.build_mode),
  );
  const readyPercent = summary.required_quantity
    ? Math.min(100, (summary.available_quantity / summary.required_quantity) * 100)
    : 0;
  const incomingPercent = Math.max(
    0,
    Math.min(100 - readyPercent, summary.progress * 100 - readyPercent),
  );
  const unpriced = plan.items.filter(
    (item) => item.purchase_quantity > 0 && item.unit_price_cents === 0,
  ).length;

  return (
    <section
      data-anime="motion-panel"
      aria-label="Purchase plan workspace"
      className="collection-panel"
    >
      <div className="collection-panel-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words">{plan.name}</h2>
            <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
              {plan.archived_at ? "Archived" : STATUS_LABELS[plan.status]}
            </span>
          </div>
          <p className="collection-muted mt-1 mb-0">
            {plan.deck?.name ?? plan.nation ?? "Independent build"}
            {plan.deck_type ? ` · ${plan.deck_type}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || saving}
            className="collection-button subtle"
            aria-label="Refresh purchase plan"
          >
            <RefreshCw />
          </button>
          {plan.archived_at ? (
            <button
              type="button"
              onClick={onRestore}
              disabled={saving || loading}
              className="collection-button"
            >
              <RotateCcw /> Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={onArchive}
              disabled={
                saving ||
                loading ||
                dirty ||
                hasRowDrafts ||
                !summary.is_physically_complete
              }
              title={
                dirty || hasRowDrafts
                  ? "Save plan details first"
                  : summary.is_physically_complete
                    ? "Archive completed plan"
                    : "Receive all planned cards to archive"
              }
              className="collection-button"
            >
              <Archive /> Archive
            </button>
          )}
        </div>
      </div>
      <div className="orders-metrics">
        {[
          {
            label: "On hand / target",
            value: `${summary.owned_quantity} / ${summary.required_quantity}`,
            color: "text-emerald-200",
          },
          {
            label: "Incoming",
            value: summary.ordered_quantity,
            color: "text-violet-200",
          },
          {
            label: "To buy",
            value: summary.missing_quantity,
            color: "text-cyan-200",
          },
          {
            label: "Remaining",
            value: formatUsdCents(summary.remaining_cost_cents),
            color: "text-slate-50",
          },
        ].map((metric) => (
          <div key={metric.label} className="orders-metric">
            <span className="collection-label">{metric.label}</span>
            <strong className={metric.color}>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="orders-progress">
        <div className="orders-progress-label collection-muted">
          <span className="inline-flex items-center gap-1.5">
            {summary.is_physically_complete && (
              <CheckCircle2 size={13} className="text-emerald-300" />
            )}
            {summary.required_quantity
              ? `${Math.round(readyPercent)}% ready`
              : "No target copies"}
          </span>
          <span>
            {summary.active_line_count ?? summary.line_count} target lines
            {summary.removed_quantity > 0
              ? ` · ${summary.pending_removed_quantity ?? summary.removed_quantity} pending removal · ${summary.confirmed_removed_quantity ?? 0} removed`
              : ""}
            {summary.overage_quantity > 0
              ? ` · ${summary.overage_quantity} extra`
              : ""}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Target copies on hand"
          aria-valuenow={Math.round(readyPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${summary.available_quantity} of ${summary.required_quantity} target copies on hand; ${summary.owned_quantity} total on hand, ${summary.ordered_quantity} incoming, ${summary.missing_quantity} to buy`}
          className="collection-progress"
        >
          <span
            className="bg-emerald-300"
            style={{ width: `${readyPercent}%` }}
          />
          <span
            className="bg-violet-300"
            style={{ width: `${incomingPercent}%` }}
          />
        </div>
        <div className="orders-progress-label collection-muted mt-3 mb-0">
          <span>Purchase estimate {formatUsdCents(summary.estimated_cost_cents)}</span>
          <span>Incoming {formatUsdCents(summary.ordered_value_cents)}</span>
        </div>
        {unpriced > 0 && (
          <p className="mt-2 mb-0 text-xs text-cyan-200">
            {unpriced} unpriced {unpriced === 1 ? "card" : "cards"}
          </p>
        )}
      </div>
      {plan.archived_at ? (
        <div className="collection-muted border-t border-white/10 px-4 py-3">
          Archived {new Date(plan.archived_at).toLocaleDateString()}
          {plan.notes ? ` · ${plan.notes}` : ""}
        </div>
      ) : (
        <details key={plan.id} className="group border-t border-white/10">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-b-2xl px-3 py-3 text-xs text-slate-400 transition hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-cyan-300 sm:px-4 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2 font-bold text-slate-300">
              <Pencil className="h-3.5 w-3.5" /> Edit plan{" "}
              {dirty ? (
                <span className="text-amber-200">· Unsaved changes</span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-3">
              <span className="hidden sm:inline">
                {plan.updated_at
                  ? `Updated ${new Date(plan.updated_at).toLocaleDateString()}`
                  : "Not updated yet"}
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </span>
          </summary>
          <fieldset
            disabled={loading || saving}
            className="border-t border-white/10 p-3 sm:p-4 min-w-0"
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
              <label className="min-w-0">
                <span className={labelClass}>Plan name</span>
                <input
                  value={plan.name}
                  onChange={(event) =>
                    onChange({ ...plan, name: event.target.value })
                  }
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0">
                <span className={labelClass}>Purchase status</span>
                <select
                  value={plan.status}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      status: event.target.value as AcquisitionPlanStatus,
                    })
                  }
                  className={fieldClass}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0">
                <span className={labelClass}>Build state</span>
                <select
                  value={plan.build_mode}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      build_mode: event.target.value as AcquisitionBuildMode,
                    })
                  }
                  className={fieldClass}
                >
                  {Object.entries(BUILD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block">
              <span className={labelClass}>Plan notes</span>
              <input
                value={plan.notes}
                onChange={(event) =>
                  onChange({ ...plan, notes: event.target.value })
                }
                placeholder="Buying goals, seller notes, deadlines..."
                className={fieldClass}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onDelete}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" /> Delete plan
              </button>
              {dirty && (
                <button
                  type="button"
                  disabled={saving || loading}
                  onClick={onDiscard}
                  className="collection-button subtle"
                >
                  <RotateCcw /> Discard edits
                </button>
              )}
              <button
                type="button"
                onClick={onSave}
                disabled={saving || loading || !plan.name.trim() || !dirty}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save plan"}
              </button>
            </div>
          </fieldset>
        </details>
      )}
    </section>
  );
}
