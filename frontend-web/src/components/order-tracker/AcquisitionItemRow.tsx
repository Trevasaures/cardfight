import { useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

import type {
  AcquisitionPlanItem,
  UpdateAcquisitionItemPayload,
} from "../../types/api";

type AcquisitionItemRowProps = {
  item: AcquisitionPlanItem;
  busy: boolean;
  onSave: (
    itemId: number,
    payload: UpdateAcquisitionItemPayload,
  ) => Promise<void>;
  onReceive: (itemId: number, quantity: number) => Promise<void>;
  onRemove: (item: AcquisitionPlanItem) => Promise<void>;
};

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

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
  busy,
  onSave,
  onReceive,
  onRemove,
}: AcquisitionItemRowProps) {
  const [targetQuantity, setTargetQuantity] = useState(
    String(item.target_quantity),
  );
  const [ownedQuantity, setOwnedQuantity] = useState(
    String(item.owned_quantity),
  );
  const [orderedQuantity, setOrderedQuantity] = useState(
    String(item.ordered_quantity),
  );
  const [price, setPrice] = useState(
    item.unit_price_cents ? (item.unit_price_cents / 100).toFixed(2) : "",
  );
  const [printingId, setPrintingId] = useState(
    item.printing_id ? String(item.printing_id) : "",
  );

  async function save() {
    await onSave(item.id, {
      target_quantity: Number(targetQuantity),
      owned_quantity: Number(ownedQuantity),
      ordered_quantity: Number(orderedQuantity),
      unit_price_cents: Math.round(Number(price || 0) * 100),
      printing_id: printingId ? Number(printingId) : null,
    });
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
    setTargetQuantity(String(item.target_quantity));
    setOwnedQuantity(String(item.owned_quantity));
    setOrderedQuantity(String(item.ordered_quantity));
    setPrice(item.unit_price_cents ? (item.unit_price_cents / 100).toFixed(2) : "");
    setPrintingId(item.printing_id ? String(item.printing_id) : "");
  }

  const printingLabel = item.printing
    ? [
        item.printing.set_code,
        item.printing.card_number,
        item.printing.rarity,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Any printing";
  const comesFromCurrentDeck = item.source_quantity > 0;
  const hasChanges =
    Number(targetQuantity) !== item.target_quantity ||
    Number(ownedQuantity) !== item.owned_quantity ||
    Number(orderedQuantity) !== item.ordered_quantity ||
    Math.round(Number(price || 0) * 100) !== item.unit_price_cents ||
    (printingId ? Number(printingId) : null) !== item.printing_id;
  const actionDisabled = busy || hasChanges;
  const actionHint = hasChanges
    ? "Save or discard row edits before using this action."
    : undefined;
  const statusHelp = {
    needed: "No copies are currently on hand or incoming.",
    partial:
      "Some of the next-version quantity is covered, but at least one copy is still needed.",
    ordered: "Every needed copy is marked incoming.",
    owned: "The on-hand quantity covers this card's next-version quantity.",
  }[item.status];

  return (
    <article
      aria-label={item.card.name}
      className={`min-w-0 rounded-2xl border bg-black/15 p-3 transition-colors sm:p-4 ${hasChanges ? "border-cyan-300/30" : "border-white/10 hover:border-white/20"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 break-words text-sm font-black text-slate-100">
              {item.card.name}
            </h4>
            <span
              className={[
                "shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold",
                STATUS_STYLES[item.status],
              ].join(" ")}
              title={statusHelp}
            >
              {STATUS_LABELS[item.status]}
            </span>
            {item.removed_quantity > 0 ? (
              <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-2 py-0.5 text-[0.65rem] font-bold text-rose-100">
                {item.removed_quantity} outgoing
              </span>
            ) : null}
          </div>

          <p className="mt-1 break-words text-xs leading-5 text-slate-400">
            {item.card.card_type} · {printingLabel}
          </p>
        </div>

        {hasChanges ? (
          <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Unsaved edits
          </span>
        ) : item.missing_quantity > 0 ? (
          <span className="text-xs text-rose-200">
            <strong className="tabular-nums">{item.missing_quantity}</strong>{" "}
            still needed
          </span>
        ) : null}
      </div>

      {comesFromCurrentDeck ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5 text-violet-300/70" />
          <span className="text-slate-400">
            Current deck{" "}
            <strong className="text-slate-100">{item.source_quantity}</strong>
          </span>
          <span className="text-slate-600">→</span>
          <span className="text-slate-400">
            Next version{" "}
            <strong className="text-violet-100">{item.target_quantity}</strong>
          </span>
          {item.removed_quantity > 0 ? (
            <span className="text-rose-200">
              · {item.removed_quantity} leaving the deck
            </span>
          ) : (
            <span className="text-emerald-200/80">· Keeping current copies</span>
          )}
        </div>
      ) : null}

      <div className="mt-3 grid min-w-0 grid-cols-3 gap-2 lg:grid-cols-[repeat(3,minmax(0,0.65fr))_minmax(0,0.9fr)_minmax(0,2fr)]">
        <label className="grid min-w-0 gap-1.5">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
            Next version
          </span>
          <input
            type="number"
            min={comesFromCurrentDeck ? "0" : "1"}
            value={targetQuantity}
            onChange={(event) => setTargetQuantity(event.target.value)}
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
            onChange={(event) => setOwnedQuantity(event.target.value)}
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
            onChange={(event) => setOrderedQuantity(event.target.value)}
            className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm tabular-nums outline-none focus:border-cyan-300/50"
          />
        </label>

        <label className="grid min-w-0 gap-1.5">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
            Unit price
          </span>
          <div className="flex min-w-0 rounded-xl border border-white/10 bg-black/25 focus-within:border-cyan-300/50">
            <span className="py-2 pl-2.5 pr-1.5 text-sm text-slate-500">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
              className="w-full min-w-0 flex-1 bg-transparent py-2 pr-2.5 text-sm tabular-nums outline-none"
            />
          </div>
        </label>

        <label className="col-span-2 grid min-w-0 gap-1.5 lg:col-span-1">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-slate-400">
            Printing
          </span>
          <select
            value={printingId}
            onChange={(event) => setPrintingId(event.target.value)}
            title={printingLabel}
            className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs outline-none focus:border-cyan-300/50"
          >
            <option value="">Any printing</option>
            {item.card.printings.map((printing) => (
              <option key={printing.id} value={printing.id}>
                {[printing.set_code, printing.card_number, printing.rarity]
                  .filter(Boolean)
                  .join(" · ") || `Printing ${printing.id}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span
            className="text-slate-400"
            title={`${item.purchase_quantity} copies to acquire × ${dollars(item.unit_price_cents)} each`}
          >
            Purchase{" "}
            <strong className="font-black tabular-nums text-slate-100">
              {dollars(item.estimated_cost_cents)}
            </strong>
          </span>
          {item.purchase_quantity > 0 ? (
            <span className="text-slate-500 tabular-nums">
              {item.purchase_quantity} ×{" "}
              {dollars(item.unit_price_cents)}
            </span>
          ) : null}
          <span className="text-slate-400">
            Not yet incoming{" "}
            <strong className={`tabular-nums ${item.missing_quantity ? "text-rose-200" : "text-slate-300"}`}>
              {dollars(item.remaining_cost_cents)}
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
              title={actionHint ?? `Mark the ${item.missing_quantity} still-needed copies as incoming.`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-300/[0.07] px-2.5 py-2 text-xs font-bold text-violet-100 transition hover:bg-violet-300/15 disabled:opacity-50"
            >
              <PackagePlus className="h-4 w-4" />
              Mark {item.missing_quantity} incoming
            </button>
          ) : null}

          {item.ordered_quantity > 0 ? (
            <button
              type="button"
              onClick={() => onReceive(item.id, item.ordered_quantity)}
              disabled={actionDisabled}
              title={actionHint ?? `Move all ${item.ordered_quantity} incoming copies to on hand.`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-50"
            >
              <PackageCheck className="h-4 w-4" />
              Receive all
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
            disabled={busy || !hasChanges}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-slate-500"
          >
            <Save className="h-4 w-4" />
            {busy ? "Saving…" : "Save row"}
          </button>
        </div>
      </div>
      {hasChanges ? (
        <p className="mt-2 text-[0.65rem] text-cyan-200/75">
          Totals reflect saved values. Save or discard edits to use the other actions.
        </p>
      ) : null}
    </article>
  );
}
