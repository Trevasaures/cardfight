import { useState } from "react";
import {
  ChevronDown,
  Pencil,
  AlertTriangle,
  ArrowRightLeft,
  PackageCheck,
  PackagePlus,
  Layers,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

import { CardArtwork } from "../cards/CardArtwork";
import { cardGradeBadge } from "../../utils/cards";
import { formatUsdCents } from "../../utils/format";
import { ModalDialog } from "../layout/ModalDialog";
import {
  createItemDraft,
  isItemDraftDirty,
  isItemDraftValid,
  itemDraftPayload,
  type PurchaseItemDraft,
} from "./order-drafts";
import {
  acquisitionLineLabel,
  canChangeOrderPrinting,
  printingAlreadyTracked,
  printingLabel,
} from "./order-printings";

import type {
  AcquisitionPlanItem,
  UpdateAcquisitionItemPayload,
} from "../../types/api";

type AcquisitionItemRowProps = {
  item: AcquisitionPlanItem;
  planItems: AcquisitionPlanItem[];
  grouped?: boolean;
  busy: boolean;
  draft?: PurchaseItemDraft;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
  onDraftChange: (itemId: number, draft: PurchaseItemDraft | null) => void;
  onInspect: (item: AcquisitionPlanItem) => void;
  onPrintingAction: (item: AcquisitionPlanItem, mode: "split" | "add") => void;
  readOnly?: boolean;
  onSave: (
    itemId: number,
    payload: UpdateAcquisitionItemPayload,
  ) => Promise<void>;
  onReceive: (itemId: number, quantity: number) => Promise<string | null>;
  onRemove: (item: AcquisitionPlanItem) => Promise<void>;
};

const STATUS_LABELS = {
  needed: "Still needed",
  partial: "More copies needed",
  ordered: "Incoming",
  owned: "Ready",
};

const STATUS_STYLES = {
  needed: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  partial: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  ordered: "border-violet-300/30 bg-violet-300/10 text-violet-100",
  owned: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
};

export function AcquisitionItemRow({
  item,
  planItems,
  grouped = false,
  busy,
  draft: savedDraft,
  selected,
  onSelectionChange,
  onDraftChange,
  onInspect,
  onPrintingAction,
  readOnly = false,
  onSave,
  onReceive,
  onRemove,
}: AcquisitionItemRowProps) {
  const [expanded, setExpanded] = useState(Boolean(savedDraft));
  const [receiving, setReceiving] = useState(false);
  const [receiveQuantity, setReceiveQuantity] = useState("1");
  const [receiveError, setReceiveError] = useState("");
  const draft = savedDraft ?? createItemDraft(item);
  const {
    target: targetQuantity,
    owned: ownedQuantity,
    incoming: orderedQuantity,
    price,
    printing: printingId,
  } = draft;

  function edit(field: keyof PurchaseItemDraft, value: string) {
    // A quote belongs to one printing, so a new rarity starts without a price.
    const next = {
      ...draft,
      [field]: value,
      ...(field === "printing" ? { price: "" } : {}),
    };
    onDraftChange(item.id, isItemDraftDirty(item, next) ? next : null);
  }

  async function save() {
    await onSave(item.id, itemDraftPayload(draft));
  }

  async function markMissingIncoming() {
    await onSave(item.id, {
      ordered_quantity: item.ordered_quantity + item.missing_quantity,
    });
  }

  async function setNextVersionQuantity(quantity: number) {
    await onSave(item.id, { target_quantity: quantity });
  }

  function discardEdits() {
    onDraftChange(item.id, null);
  }

  function openReceive() {
    setReceiveError("");
    setReceiveQuantity(String(item.ordered_quantity));
    setReceiving(true);
  }

  const quantity = Number(receiveQuantity);
  const receiveValid =
    Number.isInteger(quantity) &&
    quantity > 0 &&
    quantity <= item.ordered_quantity;

  const variantLabel = printingLabel(item.printing);
  const lineLabel = acquisitionLineLabel(item);
  const printingLocked = !canChangeOrderPrinting(item);
  const printingChanged = printingId !== String(item.printing_id ?? "");
  const printingCollision = printingAlreadyTracked(
    planItems,
    item,
    printingId ? Number(printingId) : null,
  );
  const hasOtherPrintings = item.card.printings.some(
    (printing) => printing.id !== item.printing_id,
  );
  const comesFromCurrentDeck = item.source_quantity > 0;
  const isOutgoing = item.target_quantity === 0 && item.removed_quantity > 0;
  const hasChanges = isItemDraftDirty(item, draft);
  const draftValid =
    isItemDraftValid(draft, 0) &&
    (!printingChanged ||
      (!printingLocked && !printingCollision && price.trim() !== ""));
  const actionDisabled = busy || hasChanges;
  const actionHint = hasChanges
    ? "Save or discard row edits before using this action."
    : undefined;
  return (
    <article aria-label={lineLabel} className="orders-row">
      <div className="orders-row-summary">
        {!readOnly && (
          <input
            type="checkbox"
            className="orders-select-box"
            aria-label={`Select ${lineLabel}`}
            checked={selected}
            disabled={busy || hasChanges}
            onChange={(event) => onSelectionChange(event.target.checked)}
            title={
              hasChanges
                ? "Save or discard row edits before selecting this line."
                : undefined
            }
          />
        )}
        <div className="orders-row-card">
          <div className="collection-artwork">
            <CardArtwork card={item.card} printing={item.printing} />
            <span className="collection-grade">
              {cardGradeBadge(item.card)}
            </span>
          </div>
          <div>
            <h4>
              <button
                type="button"
                className="orders-card-inspect"
                aria-label={`Inspect ${lineLabel}`}
                onClick={() => onInspect(item)}
              >
                {grouped ? variantLabel : item.card.name}
              </button>
            </h4>
            {!grouped && (
              <span className="builder-card-meta">{variantLabel}</span>
            )}
            <span
              className={`mt-1.5 inline-block rounded-md border px-1.5 py-0.5 text-[9px] ${isOutgoing ? "border-rose-300/30 bg-rose-300/10 text-rose-100" : STATUS_STYLES[item.status]}`}
            >
              {item.target_quantity === 0 && !isOutgoing
                ? "Not in target"
                : isOutgoing
                  ? `${item.removed_quantity} outgoing`
                  : STATUS_LABELS[item.status]}
            </span>
            {item.removed_quantity > 0 && !isOutgoing && (
              <span className="ml-2 text-[10px] text-rose-200">
                {item.removed_quantity} outgoing
              </span>
            )}
          </div>
        </div>
        <div
          className="orders-row-stat"
          title={`${item.owned_quantity} on hand; ${item.target_quantity} in the next deck`}
        >
          <strong>
            {item.owned_quantity}/{item.target_quantity}
          </strong>
          On hand / target
        </div>
        <div className="orders-row-stat">
          <strong className={item.ordered_quantity ? "!text-violet-200" : ""}>
            {item.ordered_quantity}
          </strong>
          Incoming
        </div>
        <div className="orders-row-stat orders-row-price">
          <strong>
            {item.purchase_quantity > 0 && item.unit_price_cents === 0
              ? "Unpriced"
              : formatUsdCents(item.estimated_cost_cents)}
          </strong>
          Purchase
          <span className="orders-unit-price">
            {item.unit_price_cents > 0
              ? `${formatUsdCents(item.unit_price_cents)} each`
              : "No price set"}
          </span>
        </div>
        {!readOnly && (
          <>
            {item.ordered_quantity > 0 && (
              <button
                type="button"
                onClick={openReceive}
                disabled={actionDisabled}
                className="collection-button"
                aria-label={`Receive ${lineLabel}`}
                title={actionHint}
              >
                <PackageCheck /> Receive
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls={`purchase-item-${item.id}`}
              aria-label={`${expanded ? "Close" : "Edit"} ${lineLabel}`}
              className="collection-button subtle"
            >
              {expanded ? <ChevronDown /> : <Pencil />}
              {hasChanges && (
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              )}
            </button>
          </>
        )}
      </div>
      {readOnly && item.notes && (
        <p className="orders-printing-note">{item.notes}</p>
      )}
      {expanded && !readOnly && (
        <div id={`purchase-item-${item.id}`} className="orders-row-editor">
          {hasOtherPrintings && (
            <div className="orders-printing-actions">
              <button
                type="button"
                className="collection-button"
                disabled={actionDisabled || item.target_quantity <= 0}
                title={actionHint}
                aria-label={`Split ${lineLabel} by rarity`}
                onClick={() => onPrintingAction(item, "split")}
              >
                <ArrowRightLeft /> Split by rarity
              </button>
              <button
                type="button"
                className="collection-button subtle"
                disabled={actionDisabled}
                title={actionHint}
                aria-label={`Add another printing of ${item.card.name}`}
                onClick={() => onPrintingAction(item, "add")}
              >
                <Layers /> Add printing
              </button>
            </div>
          )}
          {comesFromCurrentDeck ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <ArrowRightLeft
                aria-hidden="true"
                className="h-3.5 w-3.5 text-violet-300/70"
              />
              <span className="text-slate-400">
                Current deck{" "}
                <strong className="text-slate-100">
                  {item.source_quantity}
                </strong>
              </span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-400">
                Next version{" "}
                <strong className="text-violet-100">
                  {item.target_quantity}
                </strong>
              </span>
              {item.removed_quantity > 0 ? (
                <span className="text-rose-200">
                  · {item.removed_quantity} leaving the deck
                </span>
              ) : (
                <span className="text-emerald-200/80">
                  · Keeping current copies
                </span>
              )}
            </div>
          ) : null}

          <fieldset disabled={busy} className="orders-row-fields mt-3">
            <label className="grid min-w-0 gap-1.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                Target
              </span>
              <input
                type="number"
                min="0"
                value={targetQuantity}
                onChange={(event) => edit("target", event.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm tabular-nums outline-none focus:border-cyan-300/50"
              />
            </label>

            <label className="grid min-w-0 gap-1.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                On hand
              </span>
              <input
                type="number"
                min="0"
                value={ownedQuantity}
                onChange={(event) => edit("owned", event.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm tabular-nums outline-none focus:border-cyan-300/50"
              />
            </label>

            <label className="grid min-w-0 gap-1.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-violet-200/80">
                Incoming
              </span>
              <input
                type="number"
                min="0"
                value={orderedQuantity}
                onChange={(event) => edit("incoming", event.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm tabular-nums outline-none focus:border-cyan-300/50"
              />
            </label>

            <label className="grid min-w-0 gap-1.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                Unit price
              </span>
              <div className="flex min-w-0 rounded-xl border border-white/10 bg-black/25 focus-within:border-cyan-300/50">
                <span className="py-2 pl-2.5 pr-1.5 text-sm text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(event) => edit("price", event.target.value)}
                  placeholder="0.00"
                  className="w-full min-w-0 flex-1 bg-transparent py-2 pr-2.5 text-sm tabular-nums outline-none"
                />
              </div>
            </label>

            <label className="wide grid min-w-0 gap-1.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                Printing
              </span>
              <select
                value={printingId}
                disabled={printingLocked}
                onChange={(event) => edit("printing", event.target.value)}
                title={variantLabel}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs outline-none focus:border-cyan-300/50"
              >
                <option
                  value=""
                  disabled={printingAlreadyTracked(planItems, item, null)}
                >
                  Any printing
                </option>
                {item.card.printings.map((printing) => (
                  <option
                    key={printing.id}
                    value={printing.id}
                    disabled={printingAlreadyTracked(
                      planItems,
                      item,
                      printing.id,
                    )}
                  >
                    {printingLabel(printing)}
                    {printingAlreadyTracked(planItems, item, printing.id)
                      ? " · Already tracked"
                      : ""}
                  </option>
                ))}
              </select>
              {printingLocked && (
                <span className="text-[10px] text-slate-400">
                  Copies stay with this printing. Use Split by rarity to change
                  the target.
                </span>
              )}
              {printingChanged && (
                <span className="text-[10px] text-amber-200" role="status">
                  {printingLocked
                    ? "This saved draft changes a printing with tracked copies. Discard it and use Split by rarity."
                    : printingCollision
                      ? "This printing already has a line. Use Split by rarity instead."
                      : "Enter this printing's unit price, or 0 to leave it unpriced."}
                </span>
              )}
            </label>
            <label className="wide grid min-w-0 gap-1.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                Notes
              </span>
              <input
                type="text"
                value={draft.notes ?? item.notes}
                onChange={(event) => edit("notes", event.target.value)}
                placeholder="Ride deck, seller, condition…"
                className="workspace-control w-full"
              />
            </label>
          </fieldset>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span
                className="text-slate-400"
                title={`${item.purchase_quantity} copies to acquire × ${formatUsdCents(item.unit_price_cents)} each`}
              >
                Purchase{" "}
                <strong className="font-black tabular-nums text-slate-100">
                  {formatUsdCents(item.estimated_cost_cents)}
                </strong>
              </span>
              {item.purchase_quantity > 0 ? (
                <span className="text-slate-500 tabular-nums">
                  {item.purchase_quantity} × {formatUsdCents(item.unit_price_cents)}
                </span>
              ) : null}
              <span className="text-slate-400">
                Not yet incoming{" "}
                <strong
                  className={`tabular-nums ${item.missing_quantity ? "text-rose-200" : "text-slate-300"}`}
                >
                  {formatUsdCents(item.remaining_cost_cents)}
                </strong>
              </span>
              {item.purchase_quantity > 0 && item.unit_price_cents === 0 ? (
                <span className="text-amber-200/90">No unit price set</span>
              ) : null}

              {item.overage_quantity ? (
                <span className="inline-flex items-center gap-1.5 text-amber-200">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                  {item.overage_quantity} extra beyond this plan
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {comesFromCurrentDeck ? (
                item.removed_quantity > 0 ? (
                  <button
                    type="button"
                    onClick={() => setNextVersionQuantity(item.source_quantity)}
                    disabled={actionDisabled}
                    title={actionHint}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Keep current copies
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNextVersionQuantity(0)}
                    disabled={actionDisabled}
                    title={actionHint}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:border-rose-300/25 hover:bg-rose-300/5 hover:text-rose-200 disabled:opacity-50"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Replace
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  disabled={actionDisabled}
                  title={actionHint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:border-rose-300/25 hover:bg-rose-300/5 hover:text-rose-200 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}

              {item.missing_quantity > 0 ? (
                <button
                  type="button"
                  onClick={markMissingIncoming}
                  disabled={actionDisabled}
                  title={
                    actionHint ??
                    `Mark the ${item.missing_quantity} still-needed copies as incoming.`
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-300/[0.07] px-2.5 py-2 text-xs font-bold text-violet-100 transition hover:bg-violet-300/15 disabled:opacity-50"
                >
                  <PackagePlus className="h-4 w-4" />
                  Mark {item.missing_quantity} incoming
                </button>
              ) : null}

              {item.ordered_quantity > 0 ? (
                <button
                  type="button"
                  onClick={openReceive}
                  disabled={actionDisabled}
                  title={
                    actionHint ?? "Choose how many incoming copies arrived."
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-50"
                >
                  <PackageCheck className="h-4 w-4" />
                  Receive…
                </button>
              ) : null}

              {hasChanges ? (
                <button
                  type="button"
                  onClick={discardEdits}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50"
                >
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                  Discard edits
                </button>
              ) : null}

              <button
                type="button"
                onClick={save}
                disabled={busy || !hasChanges || !draftValid}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-slate-500"
              >
                <Save className="h-4 w-4" />
                {busy ? "Saving…" : "Save row"}
              </button>
            </div>
          </div>
          {hasChanges ? (
            <p className="mt-2 text-[0.65rem] text-cyan-200/75">
              Draft saved on this device.
            </p>
          ) : null}
        </div>
      )}
      {receiving && (
        <ModalDialog
          title={`Receive ${lineLabel}`}
          onClose={() => {
            if (!busy) setReceiving(false);
          }}
        >
          <form
            className="orders-receive-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!receiveValid || busy) return;
              const error = await onReceive(item.id, quantity);
              if (error) setReceiveError(error);
              else setReceiving(false);
            }}
          >
            <label
              className="collection-label"
              htmlFor={`receive-count-${item.id}`}
            >
              Copies received · {item.ordered_quantity} incoming
            </label>
            <input
              id={`receive-count-${item.id}`}
              type="number"
              min="1"
              max={item.ordered_quantity}
              autoFocus
              value={receiveQuantity}
              onChange={(event) => {
                setReceiveQuantity(event.target.value);
                setReceiveError("");
              }}
              disabled={busy}
              className="workspace-control"
            />
            {receiveError && (
              <p className="orders-dialog-error" role="alert">
                {receiveError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                className="collection-button subtle"
                onClick={() => setReceiving(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !receiveValid}
                className="collection-button primary"
              >
                <PackageCheck /> Receive {receiveValid ? quantity : ""}
              </button>
            </div>
          </form>
        </ModalDialog>
      )}
    </article>
  );
}
