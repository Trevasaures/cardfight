import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, PackageOpen, Plus } from "lucide-react";

import {
  addAcquisitionPrinting,
  batchAcquisitionItems,
  type AcquisitionBatchAction,
  archiveAcquisitionPlan,
  restoreAcquisitionPlan,
  createAcquisitionPlan,
  deleteAcquisitionPlan,
  getAcquisitionPlan,
  getAcquisitionPlans,
  receiveAcquisitionItem,
  removeAcquisitionItem,
  updateAcquisitionItem,
  updateAcquisitionPlan,
  splitAcquisitionItem,
  updateAcquisitionRemoval,
} from "../api/acquisition";
import { searchCards } from "../api/cards";
import { getDeckOptions, getDecks } from "../api/decks";
import { AcquisitionGradeSection } from "../components/order-tracker/AcquisitionGradeSection";
import { AcquisitionItemRow } from "../components/order-tracker/AcquisitionItemRow";
import { OutgoingSection } from "../components/order-tracker/OutgoingSection";
import { RemovalActionDialog } from "../components/order-tracker/RemovalActionDialog";
import { acquisitionLineLabel } from "../components/order-tracker/order-printings";
import {
  checklistItems,
  outgoingItems,
  matchesItemFilter,
  selectablePurchaseItems,
  type ItemFilter,
} from "../components/order-tracker/order-views";
import { OrderTrackerSetup } from "../components/order-tracker/OrderTrackerSetup";
import {
  PurchasePlanRail,
  type PlanScope,
} from "../components/order-tracker/PurchasePlanRail";
import { PurchaseSelectionBar } from "../components/order-tracker/PurchaseSelectionBar";
import { PurchaseCatalog } from "../components/order-tracker/PurchaseCatalog";
import {
  PrintingAllocationDialog,
  type PrintingAllocation,
} from "../components/order-tracker/PrintingAllocationDialog";
import type { PrintingActionMode } from "../components/order-tracker/printing-allocation";
import "../components/collection-workspace.css";
import "../components/order-tracker/order-tracker-ux.css";
import { ModalDialog } from "../components/layout/ModalDialog";
import { CardInspector } from "../components/cards/CardInspector";
import {
  createPlanDraft,
  EMPTY_PURCHASE_DRAFT,
  type NewPurchaseDraft,
  isItemDraftDirty,
  withoutDraft,
  type PurchaseItemDraft,
  type PurchasePlanDraft,
} from "../components/order-tracker/order-drafts";
import { PurchasePlanWorkspace } from "../components/order-tracker/PurchasePlanWorkspace";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import { usePersistentState } from "../hooks/usePersistentState";
import { isCrestCard } from "../utils/cards";
import type {
  AcquisitionPlan,
  AcquisitionPlanItem,
  AcquisitionRemovalAction,
  Card,
  CardPrinting,
  CreateAcquisitionPlanPayload,
  Deck,
  DeckOptionsResponse,
  UpdateAcquisitionItemPayload,
} from "../types/api";

const EMPTY_OPTIONS: DeckOptionsResponse = {
  types: ["Standard", "Stride"],
  nations: [],
};

const ITEM_FILTERS = [
  ["changes", "Changes"],
  ["all", "All cards"],
  ["needed", "Needs cards"],
  ["incoming", "Incoming"],
  ["owned", "Ready"],
] as const;

export function OrderTracker() {
  const [plans, setPlans] = useState<AcquisitionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<AcquisitionPlan | null>(
    null,
  );
  const [preferredPlanId, setPreferredPlanId] = usePersistentState<
    number | null
  >("cardfight.order-tracker.selected-plan", null);
  const initialPreferredPlanIdRef = useRef(preferredPlanId);
  const [scope, setScope] = usePersistentState<PlanScope>(
    "cardfight.order-tracker.scope",
    "active",
  );
  const initialScopeRef = useRef(scope);
  const planRequestRef = useRef(0);
  const [showCatalog, setShowCatalog] = useState(false);
  const [reviewItemId, setReviewItemId] = useState<number | null>(null);
  const [removalRequest, setRemovalRequest] = useState<{
    item: AcquisitionPlanItem;
    action: AcquisitionRemovalAction;
  } | null>(null);
  const [removalError, setRemovalError] = useState("");
  const [printingAction, setPrintingAction] = useState<{
    item: AcquisitionPlanItem;
    mode: PrintingActionMode;
  } | null>(null);
  const [inspected, setInspected] = useState<{
    card: Card;
    printing: CardPrinting | null;
  } | null>(null);
  const [selection, setSelection] = useState<{
    planId: number;
    ids: number[];
  } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [newPlanError, setNewPlanError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "plan"; plan: AcquisitionPlan }
    | { kind: "item"; item: AcquisitionPlanItem }
    | null
  >(null);
  const [itemDrafts, setItemDrafts] = usePersistentState<
    Record<string, PurchaseItemDraft>
  >("cardfight.order-tracker.item-drafts", {});
  const [planDrafts, setPlanDrafts] = usePersistentState<
    Record<string, PurchasePlanDraft>
  >("cardfight.order-tracker.plan-drafts", {});
  const [newPlanDraft, setNewPlanDraft] = usePersistentState<NewPurchaseDraft>(
    "cardfight.order-tracker.new-plan-draft",
    EMPTY_PURCHASE_DRAFT,
  );
  const planView =
    selectedPlan && !selectedPlan.archived_at
      ? { ...selectedPlan, ...planDrafts[String(selectedPlan.id)] }
      : selectedPlan;

  const [decks, setDecks] = useState<Deck[]>([]);
  const [options, setOptions] = useState<DeckOptionsResponse>(EMPTY_OPTIONS);

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

  function editPlan(plan: AcquisitionPlan) {
    setPlanDrafts((current) => ({
      ...current,
      [String(plan.id)]: createPlanDraft(plan),
    }));
  }

  function editItem(itemId: number, draft: PurchaseItemDraft | null) {
    setItemDrafts((current) =>
      draft
        ? { ...current, [String(itemId)]: draft }
        : withoutDraft(current, String(itemId)),
    );
    // A pending edit cannot participate in a batch that uses saved quantities.
    if (draft)
      setSelection((current) =>
        current
          ? { ...current, ids: current.ids.filter((id) => id !== itemId) }
          : null,
      );
  }

  const loadPlanSummaries = useCallback(async () => {
    const rows = await getAcquisitionPlans();
    setPlans(rows);
    return rows;
  }, []);

  const selectPlan = useCallback(
    async (planId: number) => {
      const requestId = ++planRequestRef.current;
      setLoadingPlan(true);
      try {
        const plan = await getAcquisitionPlan(planId);
        if (requestId !== planRequestRef.current) return;
        setSelectedPlan(plan);
        setPreferredPlanId(planId);
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Failed to load plan",
        );
      } finally {
        if (requestId === planRequestRef.current) setLoadingPlan(false);
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

        const visiblePlans = planRows.filter(
          (plan) =>
            Boolean(plan.archived_at) ===
            (initialScopeRef.current === "archived"),
        );
        if (visiblePlans.length) {
          const preferredPlan =
            visiblePlans.find(
              (plan) => plan.id === initialPreferredPlanIdRef.current,
            ) ?? visiblePlans[0];
          const plan = await getAcquisitionPlan(preferredPlan.id);
          if (!cancelled) {
            setSelectedPlan(plan);
            setPreferredPlanId(plan.id);
          }
        } else if (!planRows.length && initialScopeRef.current === "active") {
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
    await Promise.all([selectPlan(selectedPlan.id), loadPlanSummaries()]);
  }

  async function handleCreate(payload: CreateAcquisitionPlanPayload) {
    setNewPlanError("");
    setCreating(true);
    try {
      const created = await createAcquisitionPlan(payload);
      setPlans((current) => [created, ...current]);
      setNewPlanDraft(EMPTY_PURCHASE_DRAFT);
      setSelectedPlan(created);
      setPreferredPlanId(created.id);
      setScope("active");
      setShowSetup(false);
      setItemFilter("changes");
      setItemSearch("");
      toast.success(`Created ${created.name}.`);
      return true;
    } catch (error) {
      setNewPlanError(
        error instanceof Error ? error.message : "Failed to create plan",
      );
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function handleSavePlan() {
    if (!planView) return;

    setSavingPlan(true);
    try {
      const updated = await updateAcquisitionPlan(planView.id, {
        name: planView.name.trim(),
        status: planView.status,
        build_mode: planView.build_mode,
        notes: planView.notes,
      });
      setSelectedPlan(updated);
      setPlanDrafts((current) => withoutDraft(current, String(updated.id)));
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
    setSavingPlan(true);
    try {
      await deleteAcquisitionPlan(selectedPlan.id);
      setPlanDrafts((current) =>
        withoutDraft(current, String(selectedPlan.id)),
      );
      setItemDrafts((current) => {
        const next = { ...current };
        selectedPlan.items.forEach((item) => delete next[String(item.id)]);
        return next;
      });
      setSelection(null);
      setPendingDelete(null);
      const remaining = plans.filter((plan) => plan.id !== selectedPlan.id);
      setPlans(remaining);
      setSelectedPlan(null);

      const visiblePlans = remaining.filter(
        (plan) => Boolean(plan.archived_at) === (scope === "archived"),
      );
      if (visiblePlans.length) {
        await selectPlan(visiblePlans[0].id);
      } else {
        setPreferredPlanId(null);
      }

      toast.success("Purchase plan deleted.");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete plan",
      );
    } finally {
      setSavingPlan(false);
    }
  }

  async function changeScope(nextScope: PlanScope) {
    setScope(nextScope);
    setShowSetup(false);
    const first = plans.find(
      (plan) => Boolean(plan.archived_at) === (nextScope === "archived"),
    );
    if (first) await selectPlan(first.id);
    else {
      // Invalidate a pending selection when the requested view has no plans.
      planRequestRef.current += 1;
      setSelectedPlan(null);
      setPreferredPlanId(null);
      setLoadingPlan(false);
    }
  }

  async function handleArchive() {
    if (!selectedPlan) return;
    setSavingPlan(true);
    try {
      await archiveAcquisitionPlan(selectedPlan.id);
      const rows = await loadPlanSummaries();
      const next = rows.find((plan) => !plan.archived_at);
      setSelectedPlan(null);
      setScope("active");
      setPreferredPlanId(null);
      if (next) await selectPlan(next.id);
      toast.success("Plan archived. You can restore it from Archive.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to archive plan",
      );
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleRestore() {
    if (!selectedPlan) return;
    setSavingPlan(true);
    try {
      const restored = await restoreAcquisitionPlan(selectedPlan.id);
      setSelectedPlan(restored);
      setScope("active");
      await loadPlanSummaries();
      toast.success("Plan restored.");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to restore plan",
      );
    } finally {
      setSavingPlan(false);
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

  async function handleAddCard(card: Card, printing: CardPrinting | null) {
    if (!selectedPlan) return;

    const destination = selectedPlan.items.find(
      (item) =>
        item.card_id === card.id &&
        item.printing_id === (printing?.id ?? null),
    );
    if (
      destination &&
      itemDrafts[String(destination.id)] &&
      isItemDraftDirty(destination, itemDrafts[String(destination.id)])
    ) {
      showError("Save or discard edits on this printing before adding copies.");
      return;
    }

    const lineKey = `${card.id}-${printing?.id ?? "any"}`;
    setBusyCatalogLine(lineKey);
    try {
      const updated = await addAcquisitionPrinting(selectedPlan.id, {
        card_id: card.id,
        printing_id: printing?.id ?? null,
        required_quantity: 1,
      });
      setSelectedPlan(updated);
      setPlans((current) =>
        current.map((plan) => (plan.id === updated.id ? updated : plan)),
      );
      toast.success(
        `Added ${card.name}${printing?.rarity ? ` (${printing.rarity})` : ""}.`,
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add card");
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
      setItemDrafts((current) => withoutDraft(current, String(itemId)));
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

  async function handlePrintingAllocation(allocation: PrintingAllocation) {
    if (!selectedPlan || !printingAction) return "Select a purchase plan first.";
    const { item, mode } = printingAction;
    const destination = selectedPlan.items.find(
      (row) =>
        row.card_id === item.card_id &&
        row.printing_id === allocation.printing.id,
    );
    // A split updates two saved lines together. Never overwrite a destination draft.
    if (
      destination &&
      itemDrafts[String(destination.id)] &&
      isItemDraftDirty(destination, itemDrafts[String(destination.id)])
    ) {
      return "Save or discard edits on the destination printing first.";
    }
    setBusyItemId(item.id);
    try {
      const newLineDetails = destination
        ? {}
        : {
            unit_price_cents: allocation.unitPriceCents,
            notes: allocation.notes,
          };
      let updated: AcquisitionPlan;
      if (mode === "split") {
        updated = await splitAcquisitionItem(item.id, {
          printing_id: allocation.printing.id,
          quantity: allocation.quantity,
          inventory_policy: "keep_original",
          ...newLineDetails,
        });
      } else {
        updated = await addAcquisitionPrinting(selectedPlan.id, {
          card_id: item.card_id,
          printing_id: allocation.printing.id,
          required_quantity: allocation.quantity,
          ...newLineDetails,
        });
      }
      setSelectedPlan(updated);
      setPlans((current) =>
        current.map((plan) => (plan.id === updated.id ? updated : plan)),
      );
      setSelection(null);
      // Show both rarity lines even when the previous filter hid ready copies.
      setItemFilter("all");
      setItemSearch("");
      toast.success(
        mode === "split"
          ? "Target split between printings."
          : "Printing added to the plan.",
      );
      return null;
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Failed to update printings";
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
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Failed to receive cards";
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleRemoveItem(item: AcquisitionPlanItem) {
    setBusyItemId(item.id);
    try {
      await removeAcquisitionItem(item.id);
      setPendingDelete(null);
      setItemDrafts((current) => withoutDraft(current, String(item.id)));
      await refreshSelectedPlan();
      toast.success(`Removed ${item.card.name}.`);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to remove card",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  function requestRemoval(
    item: AcquisitionPlanItem,
    action: AcquisitionRemovalAction,
  ) {
    const draft = itemDrafts[String(item.id)];
    if (draft && isItemDraftDirty(item, draft)) {
      showError("Save or discard row edits before updating removal tracking.");
      return;
    }
    setRemovalError("");
    setRemovalRequest({ item, action });
  }

  async function handleRemoval() {
    if (!removalRequest) return;
    const { item, action } = removalRequest;
    setBusyItemId(item.id);
    try {
      const updated = await updateAcquisitionRemoval(item.id, action);
      setSelectedPlan(updated);
      setPlans((current) =>
        current.map((plan) => (plan.id === updated.id ? updated : plan)),
      );
      setSelection(null);
      setRemovalRequest(null);
      if (action === "restore_target") setReviewItemId(null);
      toast.success(
        action === "confirm"
          ? "Outgoing copies marked removed."
          : action === "restore_target"
            ? "Copies restored to the target build."
            : "Removal confirmation undone.",
      );
    } catch (error) {
      setRemovalError(
        error instanceof Error
          ? error.message
          : "Failed to update removal tracking",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  const selectedIds =
    selectedPlan && selection?.planId === selectedPlan.id
      ? selection.ids.filter((id) =>
          selectedPlan.items.some(
            (item) =>
              item.id === id &&
              item.target_quantity > 0 &&
              (!itemDrafts[String(id)] ||
                !isItemDraftDirty(item, itemDrafts[String(id)])),
          ),
        )
      : [];
  const selectedItems =
    selectedPlan?.items.filter((item) => selectedIds.includes(item.id)) ?? [];
  const dirtyItemCount =
    selectedPlan?.items.filter(
      (item) =>
        itemDrafts[String(item.id)] &&
        isItemDraftDirty(item, itemDrafts[String(item.id)]),
    ).length ?? 0;

  function toggleSelection(itemId: number, selected: boolean) {
    if (!selectedPlan) return;
    const ids = selected
      ? [...new Set([...selectedIds, itemId])]
      : selectedIds.filter((id) => id !== itemId);
    setSelection({ planId: selectedPlan.id, ids });
  }

  async function handleBatch(action: AcquisitionBatchAction) {
    if (!selectedPlan || !selectedIds.length) return;
    setBulkBusy(true);
    try {
      const plan = await batchAcquisitionItems(
        selectedPlan.id,
        action,
        selectedIds,
      );
      setSelectedPlan(plan);
      setSelection(null);
      await loadPlanSummaries();
      toast.success(
        action === "receive"
          ? "Selected deliveries received."
          : "Selected cards marked incoming.",
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Failed to update selected cards",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!selectedPlan) return [];
    return checklistItems(
      selectedPlan.items,
      itemFilter,
      itemSearch,
      Boolean(selectedPlan.archived_at),
    );
  }, [itemFilter, itemSearch, selectedPlan]);
  const visibleOutgoing = selectedPlan
    ? outgoingItems(
        selectedPlan.items,
        itemSearch,
        !selectedPlan.archived_at && itemFilter === "incoming",
      )
    : [];
  const reviewedItem = selectedPlan?.items.find((item) => item.id === reviewItemId);

  const groupedItems = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        grade: number | null;
        items: AcquisitionPlanItem[];
      }
    >();

    for (const item of filteredItems) {
      const grade = item.card.grade;
      const crest = isCrestCard(item.card);
      const key = crest ? "crest" : grade === null ? "unknown" : String(grade);
      const label = crest
        ? "Crests"
        : grade === null
          ? "Unknown grade"
          : `Grade ${grade}`;
      const group = groups.get(key) ?? { key, label, grade, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      group.items.sort((first, second) => {
        const nameSort = first.card.name.localeCompare(
          second.card.name,
          undefined,
          {
            sensitivity: "base",
            numeric: true,
          },
        );

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
      if (first.grade === null && second.grade === null)
        return first.key.localeCompare(second.key);
      if (first.grade === null) return 1;
      if (second.grade === null) return -1;
      return second.grade - first.grade;
    });
  }, [filteredItems]);

  const filterCounts = Object.fromEntries(
    ITEM_FILTERS.map(([value]) => [
      value,
      selectedPlan?.items.filter((item) => matchesItemFilter(item, value))
        .length ?? 0,
    ]),
  ) as Record<ItemFilter, number>;

  function setVisibleGradesOpen(open: boolean) {
    if (!selectedPlan) return;
    setGradeOpenState((current) => ({
      ...current,
      ...Object.fromEntries(
        groupedItems.map((group) => [`${selectedPlan.id}:${group.key}`, open]),
      ),
    }));
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Orders" />
        <div className="collection-empty" role="status">
          Loading orders…
        </div>
      </>
    );
  }

  const archived = Boolean(selectedPlan?.archived_at);
  const planBusy =
    loadingPlan ||
    savingPlan ||
    bulkBusy ||
    busyItemId !== null ||
    busyCatalogLine !== null;

  return (
    <>
      <PageHeader title="Orders" />
      <div className="collection-workspace orders-columns">
        <PurchasePlanRail
          plans={plans}
          selectedId={selectedPlan?.id}
          scope={scope}
          loading={planBusy}
          onScopeChange={changeScope}
          onSelect={selectPlan}
          onNewPlan={() => {
            setNewPlanError("");
            setShowSetup((value) => !value);
          }}
        />
        <div className="orders-main">
          {showSetup && (
            <ModalDialog
              title="New purchase plan"
              onClose={() => {
                if (!creating) setShowSetup(false);
              }}
            >
              {newPlanError && (
                <p className="orders-dialog-error" role="alert">
                  {newPlanError}
                </p>
              )}
              <OrderTrackerSetup
                decks={decks}
                options={options}
                creating={creating}
                draft={newPlanDraft}
                onDraftChange={setNewPlanDraft}
                onClose={() => setShowSetup(false)}
                onCreate={handleCreate}
                onError={setNewPlanError}
              />
            </ModalDialog>
          )}
          {selectedPlan ? (
            <>
              <PurchasePlanWorkspace
                plans={plans}
                plan={planView!}
                loading={planBusy}
                saving={savingPlan}
                onChange={editPlan}
                onDiscard={() =>
                  setPlanDrafts((current) =>
                    withoutDraft(current, String(selectedPlan.id)),
                  )
                }
                hasRowDrafts={dirtyItemCount > 0}
                onRefresh={refreshSelectedPlan}
                onSave={handleSavePlan}
                onDelete={() => {
                  setDeleteError("");
                  setPendingDelete({ kind: "plan", plan: selectedPlan });
                }}
                onArchive={handleArchive}
                onRestore={handleRestore}
              />
              <OutgoingSection
                key={selectedPlan.id}
                items={visibleOutgoing}
                busy={planBusy}
                readOnly={archived}
                drafts={itemDrafts}
                forceOpen={itemFilter === "incoming" || Boolean(itemSearch.trim())}
                onInspect={(item) =>
                  setInspected({ card: item.card, printing: item.printing })
                }
                onEdit={(item) => setReviewItemId(item.id)}
                onRemovalAction={requestRemoval}
              />
              <section
                data-anime="motion-panel"
                aria-label="Purchase checklist"
                aria-busy={loadingPlan}
                className="collection-panel"
              >
                <div className="collection-panel-header">
                  <h2>
                    Checklist{" "}
                    <span className="collection-muted ml-1">
                      {filteredItems.length}
                    </span>
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <input
                      aria-label="Search purchase checklist"
                      value={itemSearch}
                      onChange={(event) => setItemSearch(event.target.value)}
                      placeholder="Find a card…"
                      className="workspace-control w-full sm:w-48"
                    />
                    {!archived && (
                      <button
                        type="button"
                        onClick={() => setShowCatalog((value) => !value)}
                        disabled={loadingPlan || savingPlan}
                        aria-expanded={showCatalog}
                        className="collection-button"
                      >
                        <Plus /> Add cards
                      </button>
                    )}
                  </div>
                </div>
                {showCatalog && !archived && (
                  <PurchaseCatalog
                    query={catalogSearch}
                    results={catalogResults}
                    searched={catalogSearched}
                    searching={searchingCatalog}
                    busyLine={busyCatalogLine}
                    disabled={loadingPlan || savingPlan}
                    onQueryChange={setCatalogSearch}
                    onSearch={handleSearchCatalog}
                    onClear={() => {
                      setCatalogSearch("");
                      setCatalogResults([]);
                      setCatalogSearched(false);
                    }}
                    onAdd={handleAddCard}
                    onInspect={(card, printing) =>
                      setInspected({ card, printing })
                    }
                  />
                )}
                <div className="orders-filters">
                  {!archived && (
                    <div
                      role="group"
                      aria-label="Filter purchase cards"
                      className="collection-segments"
                    >
                      {ITEM_FILTERS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setItemFilter(value)}
                          aria-pressed={itemFilter === value}
                        >
                          {label}
                          <span>{filterCounts[value]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setVisibleGradesOpen(true)}
                      disabled={!groupedItems.length}
                      className="collection-button subtle"
                    >
                      Expand
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleGradesOpen(false)}
                      disabled={!groupedItems.length}
                      className="collection-button subtle"
                    >
                      Collapse
                    </button>
                  </div>
                </div>
                {!archived && (
                  <PurchaseSelectionBar
                    visibleItems={selectablePurchaseItems(filteredItems)}
                    selectedItems={selectedItems}
                    drafts={itemDrafts}
                    dirtyCount={dirtyItemCount}
                    disabled={planBusy}
                    onSelect={(ids) =>
                      setSelection({ planId: selectedPlan.id, ids })
                    }
                    onBatch={handleBatch}
                  />
                )}
                <div className="orders-checklist">
                  {groupedItems.map((group) => {
                    const key = `${selectedPlan.id}:${group.key}`;
                    return (
                      <AcquisitionGradeSection
                        key={key}
                        label={group.label}
                        items={group.items}
                        planItems={selectedPlan.items}
                        onRemovalAction={requestRemoval}
                        onPrintingAction={(item, mode) =>
                          setPrintingAction({ item, mode })
                        }
                        busyItemId={busyItemId}
                        drafts={itemDrafts}
                        selectedIds={selectedIds}
                        onSelectionChange={toggleSelection}
                        onDraftChange={editItem}
                        onInspect={(item) =>
                          setInspected({
                            card: item.card,
                            printing: item.printing,
                          })
                        }
                        readOnly={archived}
                        disabled={planBusy}
                        open={gradeOpenState[key] ?? true}
                        onOpenChange={(open) =>
                          setGradeOpenState((current) => ({
                            ...current,
                            [key]: open,
                          }))
                        }
                        onSave={handleSaveItem}
                        onReceive={handleReceiveItem}
                        onRemove={(item) => {
                          setDeleteError("");
                          setPendingDelete({ kind: "item", item });
                          return Promise.resolve();
                        }}
                      />
                    );
                  })}
                  {!groupedItems.length && (
                    <div className="collection-empty">
                      <PackageOpen size={28} />
                      <p>
                        {selectedPlan.items.length
                          ? "No purchase lines match this view."
                          : "Add cards to start your plan."}
                      </p>
                      {selectedPlan.items.length > 0 && !archived && (
                        <button
                          type="button"
                          className="collection-button"
                          onClick={() => {
                            setItemFilter("all");
                            setItemSearch("");
                          }}
                        >
                          Show all cards
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            !showSetup && (
              <div className="collection-panel collection-empty">
                {scope === "archived" ? (
                  <Archive size={30} />
                ) : (
                  <PackageOpen size={30} />
                )}
                <p>
                  {scope === "archived"
                    ? "Completed plans will appear here."
                    : "No active purchase plans."}
                </p>
                {scope === "active" && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewPlanError("");
                      setShowSetup(true);
                    }}
                    className="collection-button primary"
                  >
                    <Plus /> New plan
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>
      {pendingDelete && (
        <ModalDialog
          title={
            pendingDelete.kind === "plan"
              ? "Delete purchase plan?"
              : "Delete tracking line?"
          }
          onClose={() => {
            if (!planBusy) setPendingDelete(null);
          }}
        >
          <p className="collection-muted">
            {pendingDelete.kind === "plan"
              ? `Delete ${pendingDelete.plan.name} and its full checklist?`
              : `Permanently delete the erroneous tracking line for ${acquisitionLineLabel(pendingDelete.item)}? This does not record a deck removal.`}
          </p>
          {deleteError && (
            <p className="orders-dialog-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              autoFocus
              disabled={planBusy}
              className="collection-button subtle"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={planBusy}
              className="collection-button orders-delete-button"
              onClick={() =>
                pendingDelete.kind === "plan"
                  ? handleDeletePlan()
                  : handleRemoveItem(pendingDelete.item)
              }
            >
              {planBusy
                ? "Removing…"
                : pendingDelete.kind === "plan"
                  ? "Delete plan"
                  : "Delete tracking line"}
            </button>
          </div>
        </ModalDialog>
      )}
      {reviewedItem && selectedPlan && (
        <ModalDialog
          title="Outgoing card"
          onClose={() => {
            if (!planBusy) setReviewItemId(null);
          }}
        >
          <AcquisitionItemRow
            key={reviewedItem.id}
            item={reviewedItem}
            planItems={selectedPlan.items}
            defaultExpanded
            showSelection={false}
            busy={planBusy}
            draft={itemDrafts[String(reviewedItem.id)]}
            selected={false}
            onSelectionChange={() => {}}
            onDraftChange={editItem}
            onInspect={(item) =>
              setInspected({ card: item.card, printing: item.printing })
            }
            onPrintingAction={(item, mode) => setPrintingAction({ item, mode })}
            onRemovalAction={requestRemoval}
            readOnly={archived}
            onSave={handleSaveItem}
            onReceive={handleReceiveItem}
            onRemove={(item) => {
              setDeleteError("");
              setPendingDelete({ kind: "item", item });
              return Promise.resolve();
            }}
          />
        </ModalDialog>
      )}
      {removalRequest && (
        <RemovalActionDialog
          item={removalRequest.item}
          action={removalRequest.action}
          busy={planBusy}
          error={removalError}
          onClose={() => setRemovalRequest(null)}
          onConfirm={handleRemoval}
        />
      )}
      {printingAction && selectedPlan && (
        <PrintingAllocationDialog
          item={printingAction.item}
          mode={printingAction.mode}
          planItems={selectedPlan.items}
          dirtyItemIds={selectedPlan.items
            .filter(
              (item) =>
                itemDrafts[String(item.id)] &&
                isItemDraftDirty(item, itemDrafts[String(item.id)]),
            )
            .map((item) => item.id)}
          onClose={() => setPrintingAction(null)}
          onSave={handlePrintingAllocation}
        />
      )}
      {inspected && (
        <CardInspector
          card={inspected.card}
          printing={inspected.printing}
          onClose={() => setInspected(null)}
        />
      )}
    </>
  );
}
