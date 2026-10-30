import type { AcquisitionPlanItem } from "../../types/api";

export type PrintingActionMode = "split" | "add";

/** Even a full reassignment keeps the original printing's inventory and notes. */
export function maximumSplitQuantity(item: AcquisitionPlanItem) {
  return item.target_quantity;
}

/** Prices are entered in dollars but saved and totaled only in integer cents. */
export function parsePrintingPrice(value: string): number | null {
  if (!value.trim()) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, fraction = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function printingAllocationPreview(
  source: AcquisitionPlanItem,
  destination: AcquisitionPlanItem | undefined,
  quantity: number,
  unitPrice: number,
  mode: PrintingActionMode,
) {
  const sourceTarget = source.target_quantity - (mode === "split" ? quantity : 0);
  const destinationTarget = (destination?.target_quantity ?? 0) + quantity;
  const destinationPurchase = Math.max(
    destinationTarget - (destination?.owned_quantity ?? 0),
    0,
  );
  return {
    sourceTarget,
    destinationTarget,
    combinedTarget: sourceTarget + destinationTarget,
    destinationEstimate: destinationPurchase * unitPrice,
  };
}
