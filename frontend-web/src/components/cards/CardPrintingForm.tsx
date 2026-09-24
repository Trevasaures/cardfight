import { Layers3 } from "lucide-react";

import { FormTextInput } from "../forms/HelpfulField";
import type { CardFormOptions, CardSetOption } from "../../types/api";
import {
  cardPrintingFormIsComplete,
  type CardPrintingFormState,
} from "./cardPrintingFormState";
import { CardSetFields } from "./CardSetFields";

type CardPrintingFormProps = {
  value: CardPrintingFormState;
  options: CardFormOptions;
  disabled?: boolean;
  onChange: (value: CardPrintingFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onSetSaved: (cardSet: CardSetOption) => void;
};

export function CardPrintingForm({
  value,
  options,
  disabled = false,
  onChange,
  onSubmit,
  onCancel,
  onSetSaved,
}: CardPrintingFormProps) {
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

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CardSetFields
          value={value}
          options={options}
          disabled={disabled}
          onChange={(setFields) => onChange({ ...value, ...setFields })}
          onSetSaved={onSetSaved}
        />

        <FormTextInput
          label="Card number"
          value={value.card_number}
          onChange={(fieldValue) => updateField("card_number", fieldValue)}
          placeholder="Example: DZ-BT01/001EN"
          required
        />

        <FormTextInput
          label="Rarity"
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
