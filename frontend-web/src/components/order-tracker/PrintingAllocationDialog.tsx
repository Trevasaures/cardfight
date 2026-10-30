import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { AcquisitionPlanItem, CardPrinting } from "../../types/api";
import { ModalDialog } from "../layout/ModalDialog";
import { CardArtwork } from "../cards/CardArtwork";
import { formatUsdCents } from "../../utils/format";
import { printingLabel } from "./order-printings";
import {
  maximumSplitQuantity,
  parsePrintingPrice,
  printingAllocationPreview,
  type PrintingActionMode,
} from "./printing-allocation";

export type PrintingAllocation = {
  printing: CardPrinting;
  quantity: number;
  unitPriceCents: number;
  notes: string;
};

type Props = {
  item: AcquisitionPlanItem;
  planItems: AcquisitionPlanItem[];
  dirtyItemIds: number[];
  mode: PrintingActionMode;
  onClose: () => void;
  onSave: (allocation: PrintingAllocation) => Promise<string | null>;
};

export function PrintingAllocationDialog({
  item,
  planItems,
  dirtyItemIds,
  mode,
  onClose,
  onSave,
}: Props) {
  const options = item.card.printings.filter(
    (printing) => printing.id !== item.printing_id,
  );
  const [printingId, setPrintingId] = useState(String(options[0]?.id ?? ""));
  const [quantityInput, setQuantityInput] = useState("1");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [keepInventory, setKeepInventory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printing = options.find((option) => String(option.id) === printingId);
  const destination = planItems.find(
    (row) => row.card_id === item.card_id && row.printing_id === printing?.id,
  );
  const dirtyDestination = destination && dirtyItemIds.includes(destination.id);
  const quantity = Number(quantityInput);
  const unitPrice = destination?.unit_price_cents ?? parsePrintingPrice(price);
  const needsInventoryChoice =
    mode === "split" &&
    (item.owned_quantity > 0 || item.ordered_quantity > 0);
  const maxQuantity = mode === "split" ? maximumSplitQuantity(item) : undefined;
  const valid =
    printing &&
    !dirtyDestination &&
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    (maxQuantity === undefined || quantity <= maxQuantity) &&
    unitPrice !== null &&
    (!needsInventoryChoice || keepInventory);

  // Incomplete or excessive input should never show a negative source target.
  const previewQuantity =
    Number.isSafeInteger(quantity) && quantity > 0
      ? Math.min(quantity, maxQuantity ?? quantity)
      : 0;
  const preview = printingAllocationPreview(
    item,
    destination,
    previewQuantity,
    unitPrice ?? 0,
    mode,
  );
  const otherTargets = planItems
    .filter(
      (row) =>
        row.card_id === item.card_id &&
        row.id !== item.id &&
        row.id !== destination?.id,
    )
    .reduce((sum, row) => sum + row.target_quantity, 0);

  function selectPrinting(value: string) {
    setPrintingId(value);
    setPrice("");
    setNotes("");
    setError(null);
  }

  async function submit() {
    if (!valid || !printing || unitPrice === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const failure = await onSave({
        printing,
        quantity,
        unitPriceCents: unitPrice,
        notes,
      });
      if (failure) setError(failure);
      else onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalDialog
      title={mode === "split" ? "Split by rarity" : "Add another printing"}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="orders-printing-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="orders-printing-card-name">{item.card.name}</p>
        <fieldset disabled={busy} className="orders-printing-form">
          <label>
            <span className="collection-label">Printing</span>
            <select
              autoFocus
              className="workspace-control w-full"
              value={printingId}
              onChange={(event) => selectPrinting(event.target.value)}
            >
              {!options.length && (
                <option value="">No other printings saved</option>
              )}
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {printingLabel(option)}
                </option>
              ))}
            </select>
          </label>
          {printing && (
            <div className="orders-printing-preview">
              <div className="collection-artwork">
                <CardArtwork card={item.card} printing={printing} />
              </div>
              <div>
                <strong>{printingLabel(printing)}</strong>
                <p className="collection-muted">
                  {destination
                    ? `${destination.target_quantity} planned · ${destination.owned_quantity} on hand · ${destination.ordered_quantity} incoming`
                    : "New printing line"}
                </p>
              </div>
            </div>
          )}
          <div className="orders-printing-inputs">
            <label>
              <span className="collection-label">
                {mode === "split" ? "Copies to reassign" : "Copies to add"}
              </span>
              <input
                className="workspace-control w-full"
                type="number"
                min="1"
                max={maxQuantity}
                step="1"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
                required
              />
            </label>
            <label>
              <span className="collection-label">Unit price ($)</span>
              <input
                className="workspace-control w-full"
                type="number"
                min="0"
                step="0.01"
                placeholder="Unpriced"
                value={
                  destination
                    ? (destination.unit_price_cents / 100).toFixed(2)
                    : price
                }
                readOnly={Boolean(destination)}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
          </div>
          {destination ? (
            <p className="collection-muted">
              Adds to the existing line; its price and notes stay the same.
            </p>
          ) : (
            <label>
              <span className="collection-label">Notes</span>
              <input
                className="workspace-control w-full"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ride deck, seller…"
              />
            </label>
          )}
          {mode === "split" && (
            <div className="orders-printing-targets" aria-live="polite">
              <span>
                {printingLabel(item.printing)}{" "}
                <strong>
                  {item.target_quantity} <ArrowRight size={12} />{" "}
                  {preview.sourceTarget}
                </strong>
              </span>
              <span>
                {printingLabel(printing)}{" "}
                <strong>
                  {destination?.target_quantity ?? 0} <ArrowRight size={12} />{" "}
                  {preview.destinationTarget}
                </strong>
              </span>
            </div>
          )}
          {needsInventoryChoice && (
            <label className="orders-inventory-choice">
              <input
                type="checkbox"
                checked={keepInventory}
                onChange={(event) => setKeepInventory(event.target.checked)}
              />
              <span>
                Keep {item.owned_quantity} on hand and {item.ordered_quantity}{" "}
                incoming with {printingLabel(item.printing)}.
              </span>
            </label>
          )}
          <div className="orders-printing-total" aria-live="polite">
            <span>
              Total card target{" "}
              <strong>{preview.combinedTarget + otherTargets}</strong>
            </span>
            <span>
              This printing{" "}
              <strong>
                {unitPrice
                  ? formatUsdCents(preview.destinationEstimate)
                  : "Unpriced"}
              </strong>
            </span>
          </div>
          {dirtyDestination && (
            <p role="alert" className="orders-dialog-error">
              Save or discard edits on this printing before adding to it.
            </p>
          )}
          {error && (
            <p role="alert" className="orders-dialog-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="collection-button subtle"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="collection-button primary"
              type="submit"
              disabled={!valid || busy}
            >
              {busy
                ? "Saving…"
                : mode === "split"
                  ? "Split target"
                  : "Add printing"}
            </button>
          </div>
        </fieldset>
      </form>
    </ModalDialog>
  );
}
