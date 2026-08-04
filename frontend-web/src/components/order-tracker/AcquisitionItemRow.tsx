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
  needed: "Not covered",
  partial: "Some copies covered",
  ordered: "Fully incoming",
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
  const statusHelp = {
    needed: "No copies are currently on hand or incoming.",
    partial:
      "Some of the next-version quantity is covered, but at least one copy is still needed.",
    ordered: "Every needed copy is marked incoming.",
    owned: "The on-hand quantity covers this card's next-version quantity.",
  }[item.status];

  return (
    <article className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-slate-100">{item.card.name}</h4>
            <span
              className={[
                "rounded-full border px-2.5 py-1 text-xs font-bold",
                STATUS_STYLES[item.status],
              ].join(" ")}
              title={statusHelp}
            >
              {STATUS_LABELS[item.status]}
            </span>
            {item.removed_quantity > 0 ? (
              <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-2.5 py-1 text-xs font-bold text-rose-100">
                {item.removed_quantity} outgoing
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {item.card.card_type} · {printingLabel}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-600">
            Still needed
          </p>
          <p
            className={[
              "mt-1 text-xl font-black",
              item.missing_quantity
                ? "text-rose-100"
                : "text-emerald-100",
            ].join(" ")}
          >
            {item.missing_quantity}
          </p>
        </div>
      </div>

      {comesFromCurrentDeck ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] px-4 py-3 text-sm">
          <ArrowRightLeft className="h-4 w-4 text-violet-200" />
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
              Replace/remove {item.removed_quantity}
            </span>
          ) : (
            <span className="text-emerald-200">Keeping current copies</span>
          )}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Next version qty
          </span>
          <input
            type="number"
            min={comesFromCurrentDeck ? "0" : "1"}
            value={targetQuantity}
            onChange={(event) => setTargetQuantity(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            On hand
          </span>
          <input
            type="number"
            min="0"
            value={ownedQuantity}
            onChange={(event) => setOwnedQuantity(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Incoming
          </span>
          <input
            type="number"
            min="0"
            value={orderedQuantity}
            onChange={(event) => setOrderedQuantity(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Unit price
          </span>
          <div className="flex rounded-xl border border-white/10 bg-slate-950/70 focus-within:border-cyan-300/50">
            <span className="px-3 py-2 text-sm text-slate-600">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-sm outline-none"
            />
          </div>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Printing
          </span>
          <select
            value={printingId}
            onChange={(event) => setPrintingId(event.target.value)}
            className="min-w-0 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-slate-500">
            Purchase estimate{" "}
            <strong className="text-slate-200">
              {dollars(item.estimated_cost_cents)}
            </strong>
          </span>
          {item.purchase_quantity > 0 ? (
            <span className="text-slate-500">
              {item.purchase_quantity} to acquire ×{" "}
              {dollars(item.unit_price_cents)}
            </span>
          ) : null}
          {item.remaining_cost_cents > 0 ? (
            <span className="text-rose-200">
              {dollars(item.remaining_cost_cents)} not yet incoming
            </span>
          ) : null}

          {item.overage_quantity ? (
            <span className="inline-flex items-center gap-1.5 text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              {item.overage_quantity} extra beyond this plan
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {comesFromCurrentDeck ? (
            item.removed_quantity > 0 ? (
              <button
                type="button"
                onClick={() => setNextVersionQuantity(item.source_quantity)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Keep current copies
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setNextVersionQuantity(0)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-sm font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-50"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Replace in next version
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => onRemove(item)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-sm font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          )}

          {item.missing_quantity > 0 ? (
            <button
              type="button"
              onClick={markMissingIncoming}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-sm font-bold text-violet-100 transition hover:bg-violet-300/15 disabled:opacity-50"
            >
              <PackagePlus className="h-4 w-4" />
              Mark missing incoming
            </button>
          ) : null}

          {item.ordered_quantity > 0 ? (
            <button
              type="button"
              onClick={() => onReceive(item.id, item.ordered_quantity)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-50"
            >
              <PackageCheck className="h-4 w-4" />
              Receive all
            </button>
          ) : null}

          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save row
          </button>
        </div>
      </div>
    </article>
  );
}
