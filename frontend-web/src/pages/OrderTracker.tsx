import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ListFilter,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import {
  addAcquisitionItem,
  createAcquisitionPlan,
  deleteAcquisitionPlan,
  getAcquisitionPlan,
  getAcquisitionPlans,
  receiveAcquisitionItem,
  removeAcquisitionItem,
  updateAcquisitionItem,
  updateAcquisitionPlan,
} from "../api/acquisition";
import { searchCards } from "../api/cards";
import { getDeckOptions, getDecks } from "../api/decks";
import { AcquisitionGradeSection } from "../components/order-tracker/AcquisitionGradeSection";
import { OrderTrackerSetup } from "../components/order-tracker/OrderTrackerSetup";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { usePersistentState } from "../hooks/usePersistentState";
import type {
  AcquisitionBuildMode,
  AcquisitionPlan,
  AcquisitionPlanItem,
  AcquisitionPlanStatus,
  Card,
  CardPrinting,
  CreateAcquisitionPlanPayload,
  Deck,
  DeckOptionsResponse,
  UpdateAcquisitionItemPayload,
} from "../types/api";

type ItemFilter = "all" | "needed" | "incoming" | "owned";

const EMPTY_OPTIONS: DeckOptionsResponse = {
  types: ["Standard", "Stride"],
  nations: [],
};

const STATUS_LABELS: Record<AcquisitionPlanStatus, string> = {
  planning: "Planning",
  buying: "Buying",
  waiting: "Waiting for delivery",
  complete: "Complete",
  paused: "Paused",
};

const BUILD_MODE_LABELS: Record<AcquisitionBuildMode, string> = {
  physical: "Physical build",
  proxy: "Proxy build",
  mixed: "Mixed physical/proxy",
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function updatedLabel(value: string | null) {
  if (!value) return "Not updated yet";
  return new Date(value).toLocaleString();
}

export function OrderTracker() {
  const [plans, setPlans] = useState<AcquisitionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<AcquisitionPlan | null>(
    null,
  );
  const [preferredPlanId, setPreferredPlanId] = usePersistentState<
    number | null
  >("cardfight.order-tracker.selected-plan", null);
  const initialPreferredPlanIdRef = useRef(preferredPlanId);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [options, setOptions] =
    useState<DeckOptionsResponse>(EMPTY_OPTIONS);

  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const [itemFilter, setItemFilter] = usePersistentState<ItemFilter>(
    "cardfight.order-tracker.item-filter",
    "all",
  );
  const [itemSearch, setItemSearch] = usePersistentState(
    "cardfight.order-tracker.item-search",
    "",
  );
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<Card[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [busyCatalogLine, setBusyCatalogLine] = useState<string | null>(null);
  const [gradeOpenState, setGradeOpenState] = usePersistentState<
    Record<string, boolean>
  >("cardfight.order-tracker.grade-open-state", {});

  const toast = useToast();
  const showError = useCallback(
    (message: string) => toast.error(message),
    [toast],
  );

  const loadPlanSummaries = useCallback(async () => {
    const rows = await getAcquisitionPlans();
    setPlans(rows);
    return rows;
  }, []);

  const selectPlan = useCallback(
    async (planId: number) => {
      setLoadingPlan(true);
      try {
        const plan = await getAcquisitionPlan(planId);
        setSelectedPlan(plan);
        setPreferredPlanId(planId);
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Failed to load plan",
        );
      } finally {
        setLoadingPlan(false);
      }
    },
    [setPreferredPlanId, showError],
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([getAcquisitionPlans(), getDecks(true), getDeckOptions()])
      .then(async ([planRows, deckRows, deckOptions]) => {
        if (cancelled) return;
        setPlans(planRows);
        setDecks(deckRows);
        setOptions(deckOptions);

        if (planRows.length) {
          const preferredPlan =
            planRows.find(
              (plan) => plan.id === initialPreferredPlanIdRef.current,
            ) ?? planRows[0];
          const plan = await getAcquisitionPlan(preferredPlan.id);
          if (!cancelled) {
            setSelectedPlan(plan);
            setPreferredPlanId(plan.id);
          }
        } else {
          setShowSetup(true);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        showError(
          error instanceof Error
            ? error.message
            : "Failed to load the order tracker",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setPreferredPlanId, showError]);

  async function refreshSelectedPlan() {
    if (!selectedPlan) return;
    await Promise.all([
      selectPlan(selectedPlan.id),
      loadPlanSummaries(),
    ]);
  }

  async function handleCreate(payload: CreateAcquisitionPlanPayload) {
    setCreating(true);
    try {
      const created = await createAcquisitionPlan(payload);
      await loadPlanSummaries();
      setSelectedPlan(created);
      setPreferredPlanId(created.id);
      setShowSetup(false);
      setItemFilter("all");
      setItemSearch("");
      toast.success(`Created ${created.name}.`);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to create plan",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSavePlan() {
    if (!selectedPlan) return;

    setSavingPlan(true);
    try {
      const updated = await updateAcquisitionPlan(selectedPlan.id, {
        name: selectedPlan.name.trim(),
        status: selectedPlan.status,
        build_mode: selectedPlan.build_mode,
        notes: selectedPlan.notes,
      });
      setSelectedPlan(updated);
      await loadPlanSummaries();
      toast.success("Purchase plan updated.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to update plan",
      );
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleDeletePlan() {
    if (!selectedPlan) return;
    if (!window.confirm(`Delete "${selectedPlan.name}" and its card list?`)) {
      return;
    }

    try {
      await deleteAcquisitionPlan(selectedPlan.id);
      const remaining = await loadPlanSummaries();
      setSelectedPlan(null);

      if (remaining.length) {
        await selectPlan(remaining[0].id);
      } else {
        setPreferredPlanId(null);
        setShowSetup(true);
      }

      toast.success("Purchase plan deleted.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to delete plan",
      );
    }
  }

  async function handleSearchCatalog() {
    const query = catalogSearch.trim();
    if (!query) {
      setCatalogResults([]);
      return;
    }

    setSearchingCatalog(true);
    try {
      const results = await searchCards({ q: query, limit: 12 });
      setCatalogResults(results);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to search cards",
      );
    } finally {
      setSearchingCatalog(false);
    }
  }

  async function handleAddCard(
    card: Card,
    printing: CardPrinting | null,
  ) {
    if (!selectedPlan) return;

    const lineKey = `${card.id}-${printing?.id ?? "any"}`;
    setBusyCatalogLine(lineKey);
    try {
      await addAcquisitionItem(selectedPlan.id, {
        card_id: card.id,
        printing_id: printing?.id ?? null,
        required_quantity: 1,
      });
      await refreshSelectedPlan();
      toast.success(
        `Added ${card.name}${printing?.rarity ? ` (${printing.rarity})` : ""}.`,
      );
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to add card",
      );
    } finally {
      setBusyCatalogLine(null);
    }
  }

  async function handleSaveItem(
    itemId: number,
    payload: UpdateAcquisitionItemPayload,
  ) {
    setBusyItemId(itemId);
    try {
      await updateAcquisitionItem(itemId, payload);
      await refreshSelectedPlan();
      toast.success("Card purchase details updated.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to update card",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleReceiveItem(itemId: number, quantity: number) {
    setBusyItemId(itemId);
    try {
      await receiveAcquisitionItem(itemId, quantity);
      await refreshSelectedPlan();
      toast.success(`Received ${quantity} card${quantity === 1 ? "" : "s"}.`);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to receive cards",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleRemoveItem(item: AcquisitionPlanItem) {
    if (!window.confirm(`Remove ${item.card.name} from this purchase plan?`)) {
      return;
    }

    setBusyItemId(item.id);
    try {
      await removeAcquisitionItem(item.id);
      await refreshSelectedPlan();
      toast.success(`Removed ${item.card.name}.`);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to remove card",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  const filteredItems = useMemo(() => {
    if (!selectedPlan) return [];
    const needle = itemSearch.trim().toLowerCase();

    return selectedPlan.items.filter((item) => {
      const matchesSearch =
        !needle ||
        item.card.name.toLowerCase().includes(needle) ||
        (item.printing?.set_code ?? "").toLowerCase().includes(needle) ||
        (item.printing?.rarity ?? "").toLowerCase().includes(needle);

      const matchesFilter =
        itemFilter === "all" ||
        (itemFilter === "needed" && item.missing_quantity > 0) ||
        (itemFilter === "incoming" && item.ordered_quantity > 0) ||
        (itemFilter === "owned" &&
          item.owned_quantity >= item.required_quantity);

      return matchesSearch && matchesFilter;
    });
  }, [itemFilter, itemSearch, selectedPlan]);

  const groupedItems = useMemo(() => {
    const groups = new Map<
      string,
      { grade: number | null; items: AcquisitionPlanItem[] }
    >();

    for (const item of filteredItems) {
      const grade = item.card.grade;
      const key = grade === null ? "unknown" : String(grade);
      const group = groups.get(key) ?? { grade, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      group.items.sort((first, second) => {
        const nameSort = first.card.name.localeCompare(second.card.name, undefined, {
          sensitivity: "base",
          numeric: true,
        });

        if (nameSort !== 0) return nameSort;

        const firstPrinting = [
          first.printing?.set_code,
          first.printing?.card_number,
          first.printing?.rarity,
        ]
          .filter(Boolean)
          .join(" ");
        const secondPrinting = [
          second.printing?.set_code,
          second.printing?.card_number,
          second.printing?.rarity,
        ]
          .filter(Boolean)
          .join(" ");

        return firstPrinting.localeCompare(secondPrinting, undefined, {
          sensitivity: "base",
          numeric: true,
        });
      });
    }

    return Array.from(groups.values()).sort((first, second) => {
      if (first.grade === null) return 1;
      if (second.grade === null) return -1;
      return second.grade - first.grade;
    });
  }, [filteredItems]);

  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="Order Tracker"
          title="Plan the physical build"
          description="Loading purchase plans, deck lists, and card inventory context."
        />
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-slate-400">
          Loading order tracker...
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Order Tracker"
          title="Turn deck ideas into physical builds"
          description="Plan cards from scratch or from an existing deck list, then track what you own, what is incoming, and what still needs to be purchased."
        />

        <button
          type="button"
          onClick={() => setShowSetup((current) => !current)}
          className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
        >
          <Plus className="h-4 w-4" />
          {showSetup ? "Hide setup" : "New purchase plan"}
        </button>
      </div>

      {showSetup ? (
        <OrderTrackerSetup
          decks={decks}
          options={options}
          creating={creating}
          onCreate={handleCreate}
          onError={showError}
        />
      ) : null}

      {plans.length ? (
        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-300">
                Active purchase plan
              </span>
              <select
                value={selectedPlan?.id ?? ""}
                onChange={(event) => selectPlan(Number(event.target.value))}
                disabled={loadingPlan}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50 disabled:opacity-50"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {STATUS_LABELS[plan.status]}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={refreshSelectedPlan}
              disabled={!selectedPlan || loadingPlan}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </section>
      ) : null}

      {selectedPlan ? (
        <>
          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                    {selectedPlan.plan_type === "new_build"
                      ? "New physical build"
                      : "Existing deck upgrade"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-bold text-slate-300">
                    {selectedPlan.list_source === "empty"
                      ? "Started empty"
                      : "Copied a deck version"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  {selectedPlan.deck?.name ??
                    selectedPlan.nation ??
                    "Independent build"}
                  {selectedPlan.deck_type
                    ? ` · ${selectedPlan.deck_type}`
                    : ""}
                  {" · "}
                  Updated {updatedLabel(selectedPlan.updated_at)}
                </p>
              </div>

              <button
                type="button"
                onClick={handleDeletePlan}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-sm font-bold text-rose-200 transition hover:bg-rose-300/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete plan
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.7fr_0.8fr]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-300">
                  Plan name
                </span>
                <input
                  value={selectedPlan.name}
                  onChange={(event) =>
                    setSelectedPlan((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-300/50"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-300">
                  Purchase status
                </span>
                <select
                  value={selectedPlan.status}
                  onChange={(event) =>
                    setSelectedPlan((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target
                              .value as AcquisitionPlanStatus,
                          }
                        : current,
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-300/50"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-300">
                  Build state
                </span>
                <select
                  value={selectedPlan.build_mode}
                  onChange={(event) =>
                    setSelectedPlan((current) =>
                      current
                        ? {
                            ...current,
                            build_mode: event.target
                              .value as AcquisitionBuildMode,
                          }
                        : current,
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-300/50"
                >
                  {Object.entries(BUILD_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-300">
                  Plan notes
                </span>
                <input
                  value={selectedPlan.notes}
                  onChange={(event) =>
                    setSelectedPlan((current) =>
                      current
                        ? { ...current, notes: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Buying goals, seller notes, deadlines..."
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                />
              </label>

              <button
                type="button"
                onClick={handleSavePlan}
                disabled={savingPlan}
                className="inline-flex items-center justify-center gap-2 self-end rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingPlan ? "Saving..." : "Save plan"}
              </button>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Required",
                value: selectedPlan.summary.required_quantity,
                helper: `${selectedPlan.summary.line_count} unique card lines`,
              },
              {
                label: "Owned",
                value: selectedPlan.summary.owned_quantity,
                helper: selectedPlan.summary.is_physically_complete
                  ? "Physical build complete"
                  : "Copies currently available",
              },
              {
                label: "Incoming",
                value: selectedPlan.summary.ordered_quantity,
                helper: dollars(selectedPlan.summary.ordered_value_cents),
              },
              {
                label: "Still missing",
                value: selectedPlan.summary.missing_quantity,
                helper: selectedPlan.summary.overage_quantity
                  ? `${selectedPlan.summary.overage_quantity} over target`
                  : "Not yet owned or ordered",
              },
              {
                label: "Remaining estimate",
                value: dollars(selectedPlan.summary.remaining_cost_cents),
                helper: `${Math.round(selectedPlan.summary.progress * 100)}% accounted for`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
              >
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="mt-2 text-2xl font-black text-slate-50">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-slate-600">{stat.helper}</p>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                  Add a card
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Search the shared card catalog and add another requirement.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearchCatalog();
                  }}
                  placeholder="Search card name, nation, or skill text..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                />
              </label>
              <button
                type="button"
                onClick={handleSearchCatalog}
                disabled={searchingCatalog}
                className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-50"
              >
                {searchingCatalog ? "Searching..." : "Search catalog"}
              </button>
            </div>

            {catalogResults.length ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {catalogResults.flatMap((card) => {
                  const printings = card.printings.length
                    ? card.printings
                    : [null];

                  return printings.map((printing) => {
                    const lineKey = `${card.id}-${printing?.id ?? "any"}`;
                    const printingLabel = printing
                      ? [
                          printing.set_code,
                          printing.card_number,
                          printing.rarity,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Any printing";

                    return (
                      <button
                        key={lineKey}
                        type="button"
                        onClick={() => handleAddCard(card, printing)}
                        disabled={busyCatalogLine === lineKey}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/5 disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-slate-100">
                            {card.name}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {printingLabel}
                          </span>
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-cyan-200" />
                      </button>
                    );
                  });
                })}
              </div>
            ) : null}
          </section>

          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-cyan-200" />
                  <h3 className="text-xl font-black">Purchase checklist</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Quantities never go negative; extra copies are shown as an
                  over-target warning.
                </p>
              </div>

              <label className="relative min-w-64 flex-1 md:max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder="Search this purchase list..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All cards"],
                  ["needed", "Needs attention"],
                  ["incoming", "Incoming"],
                  ["owned", "Owned"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setItemFilter(value)}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition",
                    itemFilter === value
                      ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-black/20 text-slate-400 hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <ListFilter className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {loadingPlan ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-8 text-slate-500">
                Loading purchase checklist...
              </div>
            ) : filteredItems.length ? (
              <div className="mt-5 grid gap-4">
                {groupedItems.map((group) => (
                  <AcquisitionGradeSection
                    key={group.grade ?? "unknown"}
                    grade={group.grade}
                    items={group.items}
                    busyItemId={busyItemId}
                    open={
                      gradeOpenState[
                        `${selectedPlan.id}:${group.grade ?? "unknown"}`
                      ] ?? true
                    }
                    onOpenChange={(open) => {
                      const gradeKey = `${selectedPlan.id}:${group.grade ?? "unknown"}`;
                      setGradeOpenState((current) =>
                        current[gradeKey] === open
                          ? current
                          : { ...current, [gradeKey]: open },
                      );
                    }}
                    onSave={handleSaveItem}
                    onReceive={handleReceiveItem}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </div>
            ) : selectedPlan.items.length ? (
              <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-black/10 p-8 text-center text-slate-500">
                No cards match this filter.
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-black/10 p-10 text-center">
                <PackageOpen className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3 font-bold text-slate-300">
                  This purchase plan is empty
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Search the card catalog above, or create another plan from a
                  deck version to import its full list.
                </p>
              </div>
            )}
          </section>
        </>
      ) : plans.length ? null : (
        <section className="mt-6 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
          <Archive className="mx-auto h-9 w-9 text-slate-600" />
          <h3 className="mt-4 text-xl font-black text-slate-200">
            No purchase plans yet
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Choose whether you are building from scratch or upgrading an
            existing deck above.
          </p>
        </section>
      )}
    </>
  );
}
