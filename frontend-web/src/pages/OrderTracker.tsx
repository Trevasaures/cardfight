import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  PackageOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

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
import { PurchasePlanWorkspace } from "../components/order-tracker/PurchasePlanWorkspace";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { usePersistentState } from "../hooks/usePersistentState";
import type {
  AcquisitionPlan,
  AcquisitionPlanItem,
  Card,
  CardPrinting,
  CreateAcquisitionPlanPayload,
  Deck,
  DeckOptionsResponse,
  UpdateAcquisitionItemPayload,
} from "../types/api";

type ItemFilter = "changes" | "all" | "needed" | "incoming" | "owned";

const EMPTY_OPTIONS: DeckOptionsResponse = {
  types: ["Standard", "Stride"],
  nations: [],
};

const ITEM_FILTERS = [["changes", "Changes"], ["all", "All cards"], ["needed", "Needs cards"], ["incoming", "Incoming"], ["owned", "Ready"]] as const;
const FILTER_HELP: Record<ItemFilter, string> = {
  changes: "New cards, replacements, incoming orders, and missing copies.",
  all: "Every card in this plan, including copies you already have.",
  needed: "Copies not covered by what is on hand or incoming.",
  incoming: "Cards with copies on the way. Receive them here when delivered.",
  owned: "Cards covered by copies on hand, with no copies marked outgoing.",
};

function matchesItemFilter(item: AcquisitionPlanItem, filter: ItemFilter) {
  return filter === "all" ||
    (filter === "changes" && (item.missing_quantity > 0 || item.ordered_quantity > 0 || item.removed_quantity > 0 || item.source_quantity === 0)) ||
    (filter === "needed" && item.missing_quantity > 0) ||
    (filter === "incoming" && item.ordered_quantity > 0) ||
    (filter === "owned" && item.available_quantity >= item.target_quantity && item.removed_quantity === 0);
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
    "cardfight.order-tracker.item-filter-v2",
    "changes",
  );
  const [itemSearch, setItemSearch] = usePersistentState(
    "cardfight.order-tracker.item-search",
    "",
  );
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<Card[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [catalogSearched, setCatalogSearched] = useState(false);
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
      setItemFilter("changes");
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
      setCatalogSearched(false);
      return;
    }

    setSearchingCatalog(true);
    try {
      const results = await searchCards({ q: query, limit: 12 });
      setCatalogResults(results);
      setCatalogSearched(true);
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

      const matchesFilter = matchesItemFilter(item, itemFilter);

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

  const filterCounts = Object.fromEntries(
    ITEM_FILTERS.map(([value]) => [value, selectedPlan?.items.filter((item) => matchesItemFilter(item, value)).length ?? 0]),
  ) as Record<ItemFilter, number>;

  function setVisibleGradesOpen(open: boolean) {
    if (!selectedPlan) return;
    setGradeOpenState((current) => ({
      ...current,
      ...Object.fromEntries(groupedItems.map((group) => [`${selectedPlan.id}:${group.grade ?? "unknown"}`, open])),
    }));
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Order Tracker" title="Plan the physical build" description="Loading your purchase workspace." />
        <div role="status" className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-8 text-slate-400">Loading order tracker...</div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <PageHeader eyebrow="Order Tracker" title="Turn deck ideas into physical builds" description="Plan your next build, price the cards, and follow each purchase through to delivery." />
        <button type="button" onClick={() => setShowSetup((current) => !current)} aria-expanded={showSetup} aria-controls="new-purchase-plan" className="mb-4 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
          {showSetup ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showSetup ? "Close new plan" : "New purchase plan"}
        </button>
      </div>

      <div className="space-y-4">
        {showSetup ? (
          <div id="new-purchase-plan">
            <OrderTrackerSetup decks={decks} options={options} creating={creating} onCreate={handleCreate} onError={showError} />
          </div>
        ) : null}

        {selectedPlan ? (
          <>
            <PurchasePlanWorkspace
              plans={plans} plan={selectedPlan} loading={loadingPlan} saving={savingPlan}
              onSelect={selectPlan} onChange={setSelectedPlan} onRefresh={refreshSelectedPlan}
              onSave={handleSavePlan} onDelete={handleDeletePlan}
            />

            <section data-anime="motion-panel" aria-label="Add cards from the catalog" className="min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
              <div className="grid gap-3 xl:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] xl:items-center">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-100">Catalog</span>
                  <div>
                    <h3 className="text-lg font-black text-slate-50">Add to this plan</h3>
                    <p className="mt-0.5 text-xs text-slate-400">Pick the exact printing you want to purchase.</p>
                  </div>
                </div>
                <div className="flex min-w-0 gap-2">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Search card catalog</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleSearchCatalog(); }} placeholder="Card name, set, nation..." className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-300/50" />
                  </label>
                  <button type="button" onClick={handleSearchCatalog} disabled={searchingCatalog} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2.5 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-50">{searchingCatalog ? "Searching..." : "Search catalog"}</button>
                  {catalogSearch || catalogResults.length ? <button type="button" aria-label="Clear catalog search" onClick={() => { setCatalogSearch(""); setCatalogResults([]); setCatalogSearched(false); }} className="rounded-xl border border-white/10 px-2.5 text-slate-400 transition hover:bg-white/5"><X className="h-4 w-4" /></button> : null}
                </div>
              </div>

              {catalogResults.length ? (
                <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
                  <p className="px-2 pb-2 pt-1 text-xs text-slate-400">Choose a printing to add one copy. Adjust quantities in the checklist.</p>
                  <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                    {catalogResults.flatMap((card) => (card.printings.length ? card.printings : [null]).map((printing) => {
                      const lineKey = `${card.id}-${printing?.id ?? "any"}`;
                      const printingLabel = printing ? [printing.set_code, printing.card_number, printing.rarity].filter(Boolean).join(" · ") : "Any printing";
                      return <button key={lineKey} type="button" onClick={() => handleAddCard(card, printing)} disabled={busyCatalogLine !== null || loadingPlan} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/5 disabled:opacity-50">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/5 text-[0.68rem] font-black text-cyan-100">G{card.grade ?? "?"}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-100">{card.name}</span><span className="mt-0.5 block break-words text-xs text-slate-400">{printingLabel}</span></span>
                        <Plus className="h-4 w-4 shrink-0 text-cyan-200" />
                      </button>;
                    }))}
                  </div>
                </div>
              ) : catalogSearched && !searchingCatalog ? (
                <p role="status" className="mt-3 rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">No matching cards. Try a different name or set, or <Link to="/cards" className="font-bold text-cyan-200 underline underline-offset-4">create a card in Card Library</Link>.</p>
              ) : null}
            </section>

            <section data-anime="motion-panel" aria-label="Purchase checklist" className="min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-100">Track</span>
                  <div><h3 className="text-xl font-black text-slate-50 sm:text-2xl">Purchase checklist</h3><p className="mt-0.5 text-xs text-slate-400">{selectedPlan.plan_type === "existing_deck" ? "Follow the copies staying, leaving, and arriving for your next version." : "Track what you have, what is on the way, and what is left to buy."}</p></div>
                </div>
                <label className="relative w-full min-w-0 sm:w-72">
                  <span className="sr-only">Search purchase checklist</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Find a card or printing..." className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-300/50" />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-2.5 sm:p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div role="group" aria-label="Filter purchase cards" className="flex flex-wrap gap-1.5">
                    {ITEM_FILTERS.map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setItemFilter(value)} aria-pressed={itemFilter === value} className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold transition ${itemFilter === value ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}>
                        {label}<span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[0.65rem] tabular-nums">{filterCounts[value]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setVisibleGradesOpen(true)} disabled={!groupedItems.length || loadingPlan} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-slate-100 disabled:opacity-40">Expand grades</button>
                    <button type="button" onClick={() => setVisibleGradesOpen(false)} disabled={!groupedItems.length || loadingPlan} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-slate-100 disabled:opacity-40">Collapse grades</button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs text-slate-400">
                  <p>{FILTER_HELP[itemFilter]}</p>
                  <span className="shrink-0 tabular-nums">{filteredItems.length} of {selectedPlan.items.length} card lines</span>
                </div>
              </div>

              {loadingPlan ? (
                <div role="status" className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-6 text-slate-400">Loading purchase checklist...</div>
              ) : filteredItems.length ? (
                <div className="mt-3 grid gap-3">
                  {groupedItems.map((group) => (
                    <AcquisitionGradeSection key={`${selectedPlan.id}:${group.grade ?? "unknown"}`} grade={group.grade} items={group.items} busyItemId={busyItemId}
                      open={gradeOpenState[`${selectedPlan.id}:${group.grade ?? "unknown"}`] ?? true}
                      onOpenChange={(open) => { const gradeKey = `${selectedPlan.id}:${group.grade ?? "unknown"}`; setGradeOpenState((current) => current[gradeKey] === open ? current : { ...current, [gradeKey]: open }); }}
                      onSave={handleSaveItem} onReceive={handleReceiveItem} onRemove={handleRemoveItem} />
                  ))}
                </div>
              ) : selectedPlan.items.length ? (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black/10 p-6 text-center">
                  <PackageOpen className="mx-auto h-6 w-6 text-slate-500" />
                  <p className="mt-2 text-sm text-slate-400">{itemSearch.trim() ? "No cards match your search and filter." : itemFilter === "changes" ? "No swaps or purchases are tracked yet. Add a card or view all cards to plan replacements." : "No cards match this filter."}</p>
                  <button type="button" onClick={() => { setItemFilter("all"); setItemSearch(""); }} className="mt-3 rounded-xl border border-cyan-300/20 px-3 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/10">Show all cards</button>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black/10 p-8 text-center">
                  <PackageOpen className="mx-auto h-7 w-7 text-slate-500" /><p className="mt-3 font-bold text-slate-300">This purchase plan is empty</p>
                  <p className="mt-1 text-sm text-slate-400">Search the catalog above to add cards, or start a new plan from a saved deck version.</p>
                </div>
              )}
            </section>
          </>
        ) : !plans.length ? (
          <section className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
            <Archive className="mx-auto h-8 w-8 text-slate-500" /><h3 className="mt-3 text-xl font-black text-slate-200">No purchase plans yet</h3>
            <p className="mt-2 text-sm text-slate-400">Choose whether you are building from scratch or upgrading an existing deck above.</p>
          </section>
        ) : null}
      </div>
    </>
  );
}
