import type { AcquisitionPlanItem, CardPrinting } from "../../types/api";

/** Rarity comes first so variants of the same card remain easy to distinguish. */
export function printingLabel(printing: CardPrinting | null | undefined) {
  if (!printing) return "Any printing";
  return (
    [printing.rarity, printing.set_code, printing.card_number]
      .filter(Boolean)
      .join(" · ") || `Printing ${printing.id}`
  );
}

export function acquisitionLineLabel(item: AcquisitionPlanItem) {
  return `${item.card.name} · ${printingLabel(item.printing)}`;
}

export function canChangeOrderPrinting(item: AcquisitionPlanItem) {
  return (
    item.source_quantity === 0 &&
    item.owned_quantity === 0 &&
    item.ordered_quantity === 0
  );
}

export function printingAlreadyTracked(
  items: AcquisitionPlanItem[],
  item: AcquisitionPlanItem,
  printingId: number | null,
) {
  return items.some(
    (other) =>
      other.id !== item.id &&
      other.card_id === item.card_id &&
      other.printing_id === printingId,
  );
}

/** Group only visible rows; hidden variants must not change filter totals. */
export function groupOrderPrintings(items: AcquisitionPlanItem[]) {
  const groups = new Map<number, AcquisitionPlanItem[]>();
  for (const item of items) {
    const group = groups.get(item.card_id);
    if (group) group.push(item);
    else groups.set(item.card_id, [item]);
  }
  return [...groups.values()];
}
