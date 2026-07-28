import { Layers3 } from "lucide-react";

import { FormSelect, FormTextInput } from "../forms/HelpfulField";
import type { CardFormOptions } from "../../types/api";
import {
  cardPrintingFormIsComplete,
  type CardPrintingFormState,
} from "./cardPrintingFormState";

type CardPrintingFormProps = {
  value: CardPrintingFormState;
  options: CardFormOptions;
  disabled?: boolean;
  onChange: (value: CardPrintingFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function CardPrintingForm({
  value,
  options,
  disabled = false,
  onChange,
  onSubmit,
  onCancel,
}: CardPrintingFormProps) {
  const knownSet = options.sets.find((set) => set.code === value.set_code);
  const selectedSetValue = knownSet
    ? knownSet.code
    : value.set_selection === "__custom__" || value.set_code
      ? "__custom__"
      : "";
  const canSubmit = cardPrintingFormIsComplete(value);

  function updateField(
    field: keyof CardPrintingFormState,
    fieldValue: string,
  ) {
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
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          label="Card set"
          help="Choose the product containing this printing, or use a custom set for promos and unlisted releases."
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
          <FormTextInput
            label="Custom set code"
            help="The product or promotional set code printed on the card."
            value={value.set_code}
            onChange={(fieldValue) => updateField("set_code", fieldValue)}
            placeholder="Example: D-PR"
            required
          />
        ) : (
          <FormTextInput
            label="Set name"
            help="Filled automatically from the selected set code."
            value={value.set_name}
            onChange={(fieldValue) => updateField("set_name", fieldValue)}
            placeholder="Select a card set first"
            required
            readOnly
          />
        )}

        {selectedSetValue === "__custom__" ? (
          <FormTextInput
            label="Custom set name"
            help="The full name of the unlisted product or promotional release."
            value={value.set_name}
            onChange={(fieldValue) => updateField("set_name", fieldValue)}
            placeholder="Enter the product name"
            required
          />
        ) : null}

        <FormTextInput
          label="Card number"
          help="The collector number that uniquely identifies this printing."
          value={value.card_number}
          onChange={(fieldValue) => updateField("card_number", fieldValue)}
          placeholder="Example: DZ-BT01/001EN"
          required
        />

        <FormTextInput
          label="Rarity"
          help="The rarity of this exact printing, such as RRR, SR, FFR, or PR."
          value={value.rarity}
          onChange={(fieldValue) => updateField("rarity", fieldValue)}
          placeholder="Example: SR"
          required
        />
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !canSubmit}
          className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            canSubmit
              ? "Add this printing to the existing card"
              : "Complete all printing fields before saving"
          }
        >
          <Layers3 className="h-4 w-4" />
          Add printing
        </button>
      </div>
    </div>
  );
}
