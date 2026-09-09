import { CheckCircle2, ChevronDown, PackageCheck, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import type { AcquisitionBuildMode, AcquisitionPlan, AcquisitionPlanStatus } from "../../types/api";

const STATUS_LABELS: Record<AcquisitionPlanStatus, string> = {
  planning: "Planning", buying: "Buying", waiting: "Waiting for delivery", complete: "Complete", paused: "Paused",
};
const BUILD_LABELS: Record<AcquisitionBuildMode, string> = {
  physical: "Physical build", proxy: "Proxy build", mixed: "Mixed physical/proxy",
};
const fieldClass = "min-w-0 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50";
const labelClass = "mb-1.5 block text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400";

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type Props = {
  plans: AcquisitionPlan[];
  plan: AcquisitionPlan;
  loading: boolean;
  saving: boolean;
  onSelect: (id: number) => void;
  onChange: (plan: AcquisitionPlan) => void;
  onRefresh: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export function PurchasePlanWorkspace({ plans, plan, loading, saving, onSelect, onChange, onRefresh, onSave, onDelete }: Props) {
  const { summary } = plan;
  const required = summary.required_quantity;
  const readyPercent = required ? Math.min(100, summary.owned_quantity / required * 100) : 0;
  const accountedPercent = Math.min(100, Math.max(0, summary.progress * 100));
  const unpriced = plan.items.filter((item) => item.purchase_quantity > 0 && item.unit_price_cents === 0).length;
  const savedPlan = plans.find((row) => row.id === plan.id);
  const dirty = Boolean(savedPlan && (savedPlan.name !== plan.name || savedPlan.notes !== plan.notes || savedPlan.status !== plan.status || savedPlan.build_mode !== plan.build_mode));

  return (
    <section data-anime="motion-panel" aria-label="Purchase plan workspace" className="min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-100">Plan</span>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-slate-50 sm:text-2xl">Your purchase workspace</h3>
            <p className="mt-0.5 text-xs text-slate-400">Choose a build, review its budget, and track what arrives.</p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20">
        <div className="grid xl:grid-cols-3">
          <label className="min-w-0 p-3 sm:p-4 xl:border-r xl:border-white/10">
            <span className={labelClass}>Purchase plan</span>
            <select value={plan.id} onChange={(event) => onSelect(Number(event.target.value))} disabled={loading} className={`${fieldClass} disabled:opacity-50`}>
              {plans.map((row) => <option key={row.id} value={row.id}>{row.name} · {STATUS_LABELS[row.status]}</option>)}
            </select>
          </label>
          <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-white/10 p-3 sm:p-4 xl:col-span-2 xl:border-t-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06]"><PackageCheck className="h-5 w-5 text-cyan-200" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="break-words font-black text-slate-50">{plan.name}</h4>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.68rem] font-bold text-slate-300">{STATUS_LABELS[plan.status]}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{plan.plan_type === "new_build" ? "New build" : "Existing deck upgrade"} · {plan.deck?.name ?? plan.nation ?? "Independent build"}{plan.deck_type ? ` · ${plan.deck_type}` : ""}</p>
              <p className="mt-1 text-xs text-slate-500">{BUILD_LABELS[plan.build_mode]} · {plan.list_source === "empty" ? "Started empty" : "Based on a saved deck version"}</p>
            </div>
          </div>
        </div>

        <div className="grid overflow-hidden border-t border-white/10 sm:grid-cols-3">
          {[
            { label: "Purchase estimate", value: summary.estimated_cost_cents, help: "All copies to acquire, including incoming", color: "text-cyan-100" },
            { label: "Incoming value", value: summary.ordered_value_cents, help: `${summary.ordered_quantity} copies marked incoming`, color: "text-violet-200" },
            { label: "Still to buy", value: summary.remaining_cost_cents, help: `${summary.missing_quantity} copies not on hand or incoming`, color: "text-amber-100" },
          ].map((stat) => <div key={stat.label} className="min-w-0 border-b border-white/10 bg-slate-900 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
            <p className={`mt-1 break-words text-2xl font-black tabular-nums ${stat.color}`}>{money(stat.value)}</p>
            <p className="mt-1 text-xs text-slate-400">{stat.help}</p>
          </div>)}
        </div>

        <div className="border-t border-white/10 p-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="font-bold text-slate-300">{summary.is_physically_complete && required > 0 ? <span className="inline-flex items-center gap-1.5 text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Physical build ready</span> : "Build progress"} <span className="ml-2 font-normal text-slate-400">{required} planned · {summary.line_count} card lines</span></p>
            <span className="font-bold tabular-nums text-slate-200">{Math.round(accountedPercent)}% accounted for</span>
          </div>
          <div role="progressbar" aria-label="Copies on hand or incoming" aria-valuenow={Math.round(accountedPercent)} aria-valuemin={0} aria-valuemax={100} className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full bg-emerald-300 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${readyPercent}%` }} />
            <div className="h-full bg-violet-300 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.max(0, accountedPercent - readyPercent)}%` }} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
            <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />Ready <strong className="text-emerald-200">{summary.owned_quantity}</strong></span>
            <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-300" />Incoming <strong className="text-violet-200">{summary.ordered_quantity}</strong></span>
            <span>Missing <strong className={summary.missing_quantity ? "text-amber-200" : "text-slate-200"}>{summary.missing_quantity}</strong></span>
            <span>Outgoing <strong className="text-rose-200">{summary.removed_quantity}</strong></span>
            {summary.overage_quantity > 0 ? <span className="text-amber-200">{summary.overage_quantity} extra beyond target</span> : null}
          </div>
          {unpriced > 0 ? <p className="mt-2 text-xs text-amber-200/90">{unpriced} purchase {unpriced === 1 ? "line has" : "lines have"} no unit price. Estimates count those as $0 until priced.</p> : null}
        </div>

        <details key={plan.id} className="group border-t border-white/10">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-b-2xl px-3 py-3 text-xs text-slate-400 transition hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-cyan-300 sm:px-4 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2 font-bold text-slate-300"><Pencil className="h-3.5 w-3.5" /> Edit plan details {dirty ? <span className="text-amber-200">· Unsaved changes</span> : null}</span>
            <span className="inline-flex items-center gap-3"><span className="hidden sm:inline">{plan.updated_at ? `Updated ${new Date(plan.updated_at).toLocaleDateString()}` : "Not updated yet"}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></span>
          </summary>
          <div className="border-t border-white/10 p-3 sm:p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
              <label className="min-w-0"><span className={labelClass}>Plan name</span><input value={plan.name} onChange={(event) => onChange({ ...plan, name: event.target.value })} className={fieldClass} /></label>
              <label className="min-w-0"><span className={labelClass}>Purchase status</span><select value={plan.status} onChange={(event) => onChange({ ...plan, status: event.target.value as AcquisitionPlanStatus })} className={fieldClass}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="min-w-0"><span className={labelClass}>Build state</span><select value={plan.build_mode} onChange={(event) => onChange({ ...plan, build_mode: event.target.value as AcquisitionBuildMode })} className={fieldClass}>{Object.entries(BUILD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label className="mt-3 block"><span className={labelClass}>Plan notes</span><input value={plan.notes} onChange={(event) => onChange({ ...plan, notes: event.target.value })} placeholder="Buying goals, seller notes, deadlines..." className={fieldClass} /></label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={onDelete} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Delete plan</button>
              <button type="button" onClick={onSave} disabled={saving || loading || !plan.name.trim() || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save plan"}</button>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
