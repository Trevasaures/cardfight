import { Pencil, Plus, RotateCcw } from "lucide-react";

import { FormTextInput } from "../forms/HelpfulField";
import type { ManualCardFormState } from "./manualCardFormState";

type CardFormMode = "create" | "edit";

type ManualCardFormProps = {
  value: ManualCardFormState;
  mode: CardFormMode;
  onChange: (value: ManualCardFormState) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  disabled?: boolean;
  canSubmit: boolean;
};

export function ManualCardForm({
  value,
  mode,
  onChange,
  onSubmit,
  onCancelEdit,
  disabled = false,
  canSubmit,
}: ManualCardFormProps) {
  const isEditing = mode === "edit";

  function updateField(field: keyof ManualCardFormState, fieldValue: string) {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  }

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-100">
            {isEditing ? "Edit selected card" : "Create manual card"}
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {isEditing
              ? "Changes here update the shared card record and will appear anywhere this card is used."
              : "Add enough information to identify the exact card printing."}
          </p>
        </div>

        {isEditing ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.09]"
            title="Cancel editing and return to create mode"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FormTextInput
          label="Card name"
          help="The printed name of the card, exactly as you want it to appear in the deck list."
          value={value.name}
          onChange={(fieldValue) => updateField("name", fieldValue)}
          placeholder="Example: Blangdmire"
          required
        />

        <FormTextInput
          label="Grade"
          help="The card grade. Most Vanguard units are grade 0, 1, 2, or 3. Some formats may include grade 4 units."
          value={value.grade}
          onChange={(fieldValue) => updateField("grade", fieldValue)}
          placeholder="Example: 3"
          required
          type="number"
          min={0}
        />

        <FormTextInput
          label="Nation"
          help="The nation the card belongs to, such as Dragon Empire, Dark States, Brandt Gate, Keter Sanctuary, or Stoicheia."
          value={value.nation}
          onChange={(fieldValue) => updateField("nation", fieldValue)}
          placeholder="Example: Dark States"
          required
        />

        <FormTextInput
          label="Card type"
          help="The card category, such as Normal Unit, Trigger Unit, Order, Blitz Order, or Set Order."
          value={value.card_type}
          onChange={(fieldValue) => updateField("card_type", fieldValue)}
          placeholder="Example: Normal Unit"
          required
        />

        <FormTextInput
          label="Set code"
          help="The short product or set identifier printed with the card. This helps distinguish different releases or printings."
          value={value.set_code}
          onChange={(fieldValue) => updateField("set_code", fieldValue)}
          placeholder="Example: DZ-BT01"
          required
        />

        <FormTextInput
          label="Set name"
          help="The full name of the booster, trial deck, promo release, or product the card came from."
          value={value.set_name}
          onChange={(fieldValue) => updateField("set_name", fieldValue)}
          placeholder="Example: Fated Clash"
          required
        />

        <FormTextInput
          label="Card number"
          help="The collector or card number within the set. This helps identify the exact printing."
          value={value.card_number}
          onChange={(fieldValue) => updateField("card_number", fieldValue)}
          placeholder="Example: DZ-BT01/001"
          required
        />

        <FormTextInput
          label="Rarity"
          help="The rarity for this printing, such as C, R, RR, RRR, ORRR, SEC, FFR, or SP."
          value={value.rarity}
          onChange={(fieldValue) => updateField("rarity", fieldValue)}
          placeholder="Example: RRR"
          required
        />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !canSubmit}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
        title={
          canSubmit
            ? isEditing
              ? "Save changes to this card"
              : "Create this manual card"
            : "Complete all required fields before saving"
        }
      >
        {isEditing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {isEditing ? "Save card changes" : "Create card"}
      </button>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        All fields marked with <span className="text-cyan-200">*</span> are
        required so each card entry can identify the exact printing.
      </p>
    </div>
  );
}