import { Archive, Plus, Search } from "lucide-react";
import { useState } from "react";
import type { AcquisitionPlan } from "../../types/api";

export type PlanScope = "active" | "archived";

type Props = {
  plans: AcquisitionPlan[];
  selectedId: number | undefined;
  scope: PlanScope;
  loading: boolean;
  onScopeChange: (scope: PlanScope) => void;
  onSelect: (id: number) => void;
  onNewPlan: () => void;
};

export function PurchasePlanRail({
  plans,
  selectedId,
  scope,
  loading,
  onScopeChange,
  onSelect,
  onNewPlan,
}: Props) {
  const [search, setSearch] = useState("");
  const activeCount = plans.filter((plan) => !plan.archived_at).length;
  const archivedCount = plans.length - activeCount;
  const visiblePlans = plans.filter(
    (plan) =>
      Boolean(plan.archived_at) === (scope === "archived") &&
      plan.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <aside className="collection-panel orders-rail" aria-label="Purchase plans">
      <div className="orders-rail-head">
        <h2>Plans</h2>
        <button
          type="button"
          onClick={onNewPlan}
          disabled={loading}
          className="collection-button primary"
          aria-label="New plan"
        >
          <Plus />
        </button>
      </div>
      <div className="collection-segments" role="group" aria-label="Plan view">
        <button
          type="button"
          onClick={() => {
            setSearch("");
            onScopeChange("active");
          }}
          disabled={loading}
          aria-pressed={scope === "active"}
        >
          Active <span>{activeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            onScopeChange("archived");
          }}
          disabled={loading}
          aria-pressed={scope === "archived"}
        >
          <Archive size={12} /> Archive <span>{archivedCount}</span>
        </button>
      </div>
      {plans.length > 5 && (
        <label className="relative mt-3 block">
          <span className="sr-only">Find purchase plan</span>
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a plan…"
            className="workspace-control w-full pl-8"
          />
        </label>
      )}
      <div className="orders-plan-list" aria-busy={loading}>
        {visiblePlans.map((plan) => {
          const percent = plan.summary.required_quantity
            ? Math.min(
                100,
                Math.round(
                  (plan.summary.available_quantity /
                    plan.summary.required_quantity) *
                    100,
                ),
              )
            : 0;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              disabled={loading}
              aria-current={selectedId === plan.id ? "true" : undefined}
              className="orders-plan"
            >
              <strong>{plan.name}</strong>
              <div className="orders-plan-meta">
                <span>
                  {plan.summary.is_physically_complete
                    ? "Ready"
                    : plan.summary.ordered_quantity
                      ? `${plan.summary.ordered_quantity} incoming`
                      : plan.status[0].toUpperCase() + plan.status.slice(1)}
                </span>
                <span>{plan.summary.required_quantity ? `${percent}%` : "—"}</span>
              </div>
              <div className="collection-progress" aria-hidden="true">
                <span
                  className="bg-cyan-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </button>
          );
        })}
        {!visiblePlans.length && (
          <p className="collection-muted px-2 py-4">
            {search
              ? "No matching plans."
              : scope === "archived"
                ? "No archived plans."
                : "No active plans."}
          </p>
        )}
      </div>
    </aside>
  );
}
