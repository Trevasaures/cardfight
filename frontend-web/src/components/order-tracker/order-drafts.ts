import type {
  AcquisitionPlan,
  AcquisitionPlanItem,
  UpdateAcquisitionItemPayload,
  AcquisitionPlanType,
  AcquisitionListSource,
  DeckType,
} from "../../types/api";

/** Strings preserve incomplete numeric input until the user saves the row. */
export type PurchaseItemDraft = {
  target: string;
  owned: string;
  incoming: string;
  price: string;
  printing: string;
};

export type PurchasePlanDraft = Pick<
  AcquisitionPlan,
  "name" | "status" | "build_mode" | "notes"
>;

export type NewPurchaseDraft = {
  planType: AcquisitionPlanType;
  listSource: AcquisitionListSource;
  name: string;
  deckType: DeckType;
  nation: string;
  notes: string;
  selectedDeckId: string;
  selectedVersionId: string;
};

export const EMPTY_PURCHASE_DRAFT: NewPurchaseDraft = {
  planType: "new_build",
  listSource: "empty",
  name: "",
  deckType: "Standard",
  nation: "",
  notes: "",
  selectedDeckId: "",
  selectedVersionId: "",
};

export function createItemDraft(item: AcquisitionPlanItem): PurchaseItemDraft {
  return {
    target: String(item.target_quantity),
    owned: String(item.owned_quantity),
    incoming: String(item.ordered_quantity),
    price: item.unit_price_cents
      ? (item.unit_price_cents / 100).toFixed(2)
      : "",
    printing: item.printing_id ? String(item.printing_id) : "",
  };
}

export function createPlanDraft(plan: AcquisitionPlan): PurchasePlanDraft {
  return {
    name: plan.name,
    status: plan.status,
    build_mode: plan.build_mode,
    notes: plan.notes,
  };
}

export function itemDraftPayload(
  draft: PurchaseItemDraft,
): UpdateAcquisitionItemPayload {
  return {
    target_quantity: Number(draft.target),
    owned_quantity: Number(draft.owned),
    ordered_quantity: Number(draft.incoming),
    unit_price_cents: Math.round(Number(draft.price || 0) * 100),
    printing_id: draft.printing ? Number(draft.printing) : null,
  };
}

export function isItemDraftDirty(
  item: AcquisitionPlanItem,
  draft: PurchaseItemDraft,
) {
  // An empty field must remain a draft, even when its saved value is zero.
  // Number("") is zero, so comparing parsed values alone would erase it.
  if (!isItemDraftValid(draft, 0)) return true;
  const payload = itemDraftPayload(draft);
  return (
    payload.target_quantity !== item.target_quantity ||
    payload.owned_quantity !== item.owned_quantity ||
    payload.ordered_quantity !== item.ordered_quantity ||
    payload.unit_price_cents !== item.unit_price_cents ||
    payload.printing_id !== item.printing_id
  );
}

export function isItemDraftValid(
  draft: PurchaseItemDraft,
  minimumTarget: number,
) {
  const quantities = [draft.target, draft.owned, draft.incoming];
  return (
    quantities.every(
      (value) =>
        value.trim() !== "" &&
        Number.isInteger(Number(value)) &&
        Number(value) >= 0,
    ) &&
    Number(draft.target) >= minimumTarget &&
    (draft.price.trim() === "" ||
      (Number.isFinite(Number(draft.price)) && Number(draft.price) >= 0))
  );
}

/** Removing one saved draft never discards another line's pending edits. */
export function withoutDraft<T>(
  drafts: Record<string, T>,
  key: string,
): Record<string, T> {
  const next = { ...drafts };
  delete next[key];
  return next;
}
