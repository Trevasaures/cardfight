import { Pencil, Plus, RotateCcw } from "lucide-react";

import { FormSelect, FormTextInput } from "../forms/HelpfulField";
import type { ManualCardFormState } from "./manualCardFormState";
import type { CardFormOptions } from "../../types/api";

type CardFormMode = "create" | "edit";

type ManualCardFormProps = {
  value: ManualCardFormState;
  mode: CardFormMode;
  onChange: (value: ManualCardFormState) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  disabled?: boolean;
  canSubmit: boolean;
  options: CardFormOptions;
};

export function ManualCardForm({
  value,
  mode,
  onChange,
  onSubmit,
  onCancelEdit,
  disabled = false,
  canSubmit,
  options,
}: ManualCardFormProps) {
  const isEditing = mode === "edit";
  const knownSet = options.sets.find((set) => set.code === value.set_code);
  const selectedSetValue = knownSet
    ? knownSet.code
    : value.set_selection === "__custom__" || value.set_code
      ? "__custom__"
      : "";

  const nationOptions = value.nation && !options.nations.includes(value.nation)
    ? [value.nation, ...options.nations]
    : options.nations;
  const cardTypeOptions =
    value.card_type && !options.card_types.includes(value.card_type)
      ? [value.card_type, ...options.card_types]
      : options.card_types;
  const gradeOptions =
    value.grade && !options.grades.includes(Number(value.grade))
      ? [Number(value.grade), ...options.grades]
      : options.grades;

  function updateField(field: keyof ManualCardFormState, fieldValue: string) {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  }

  function updateSetSelection(setCode: string) {
    if (setCode === "__custom__") {
      onChange({
        ...value,
        set_selection: "__custom__",
        set_code: "",
        set_name: "",
      });
      return;
    }

    const selectedSet = options.sets.find((set) => set.code === setCode);
    onChange({
      ...value,
      set_selection: setCode,
      set_code: setCode,
      set_name: selectedSet?.name ?? "",
    });
  }

  return (
    <div className="mt-4">
      {isEditing ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.09]"
            title="Cancel editing and return to create mode"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      ) : null}

      <div className={`${isEditing ? "mt-4" : ""} grid gap-3 sm:grid-cols-2`}>
        <FormTextInput
          label="Card name"
          help="The printed name of the card, exactly as you want it to appear in the deck list."
          value={value.name}
          onChange={(fieldValue) => updateField("name", fieldValue)}
          placeholder="Example: Blangdmire"
          required
        />

        <FormSelect
          label="Grade"
          help="The card grade. Most Vanguard units are grade 0, 1, 2, or 3. Some formats may include grade 4 units."
          value={value.grade}
          onChange={(fieldValue) => updateField("grade", fieldValue)}
          placeholder="Choose a grade"
          required
          options={gradeOptions.map((grade) => ({
            value: String(grade),
            label: `Grade ${grade}`,
          }))}
        />

        <FormSelect
          label="Nation"
          help="The nation or dual-nation combination printed on the card."
          value={value.nation}
          onChange={(fieldValue) => updateField("nation", fieldValue)}
          placeholder="Choose a nation"
          required
          options={nationOptions.map((nation) => ({
            value: nation,
            label: nation,
          }))}
        />

        <FormSelect
          label="Card type"
          help="The card category, such as Normal Unit, Trigger Unit, G Unit, Normal Order, Blitz Order, or Set Order."
          value={value.card_type}
          onChange={(fieldValue) => updateField("card_type", fieldValue)}
          placeholder="Choose a card type"
          required
          options={cardTypeOptions.map((cardType) => ({
            value: cardType,
            label: cardType,
          }))}
        />

        <FormSelect
          label="Card set"
          help="Choose a known set to fill its code and name automatically, or choose Custom set for promos and upcoming products."
          value={selectedSetValue}
          onChange={updateSetSelection}
          placeholder="Choose a card set"
          required
          options={[
            ...options.sets.map((set) => ({
              value: set.code,
              label: `${set.code} — ${set.name}`,
            })),
            { value: "__custom__", label: "Custom or unlisted set" },
          ]}
        />

        {selectedSetValue === "__custom__" ? (
          <>
            <FormTextInput
              label="Custom set code"
              help="The short product or set identifier printed with an unlisted card."
              value={value.set_code}
              onChange={(fieldValue) => updateField("set_code", fieldValue)}
              placeholder="Example: DZ-SS20"
              required
            />

            <FormTextInput
              label="Custom set name"
              help="The full name of the unlisted booster, deck, promo release, or product."
              value={value.set_name}
              onChange={(fieldValue) => updateField("set_name", fieldValue)}
              placeholder="Enter the product name"
              required
            />
          </>
        ) : (
          <FormTextInput
            label="Set name"
            help="This name is filled automatically from the selected set code."
            value={value.set_name}
            onChange={(fieldValue) => updateField("set_name", fieldValue)}
            placeholder="Select a card set first"
            required
            readOnly
          />
        )}

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
