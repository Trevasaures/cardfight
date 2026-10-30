import type { AcquisitionPlanItem } from "../../types/api";

export type ItemFilter = "changes" | "all" | "needed" | "incoming" | "owned";

export function isFullyOutgoing(item: AcquisitionPlanItem) {
  return item.target_quantity === 0 && item.removed_quantity > 0;
}

/** Ready and purchase work describe the next build; incoming cuts still need review. */
export function matchesItemFilter(item: AcquisitionPlanItem, filter: ItemFilter) {
  if (filter === "all") return true;
  if (filter === "incoming") return item.ordered_quantity > 0;
  if (item.target_quantity === 0) return false;
  if (filter === "needed") return item.missing_quantity > 0;
  if (filter === "owned") return item.available_quantity >= item.target_quantity;
  return (
    item.missing_quantity > 0 ||
    item.ordered_quantity > 0 ||
    item.removed_quantity > 0 ||
    item.source_quantity === 0
  );
}

export function matchesItemSearch(item: AcquisitionPlanItem, query: string) {
  const needle = query.trim().toLowerCase();
  return (
    !needle ||
    [
      item.card.name,
      item.printing?.set_code,
      item.printing?.card_number,
      item.printing?.rarity,
      item.notes,
    ].some((value) => value?.toLowerCase().includes(needle))
  );
}

/** Full cuts use the compact review area, including in All cards and archived plans. */
export function checklistItems(
  items: AcquisitionPlanItem[],
  filter: ItemFilter,
  query: string,
  archived = false,
) {
  return items.filter(
    (item) =>
      !isFullyOutgoing(item) &&
      matchesItemSearch(item, query) &&
      (archived || matchesItemFilter(item, filter)),
  );
}

export function outgoingItems(
  items: AcquisitionPlanItem[],
  query: string,
  incomingOnly = false,
) {
  return items.filter(
    (item) =>
      isFullyOutgoing(item) &&
      matchesItemSearch(item, query) &&
      (!incomingOnly || item.ordered_quantity > 0),
  );
}

export function selectablePurchaseItems(items: AcquisitionPlanItem[]) {
  return items.filter((item) => item.target_quantity > 0);
}
