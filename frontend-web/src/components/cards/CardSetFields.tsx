import { BookmarkPlus } from "lucide-react";
import { useState } from "react";

import { saveCardSet } from "../../api/cards";
import type { CardFormOptions, CardSetOption } from "../../types/api";
import { useToast } from "../feedback/useToast";
import { FormSelect, FormTextInput } from "../forms/HelpfulField";
import type { CardSetFormValue } from "./cardSetSelectionState";

type CardSetFieldsProps = {
  value: CardSetFormValue;
  options: CardFormOptions;
  disabled?: boolean;
  onChange: (value: CardSetFormValue) => void;
  onSetSaved: (cardSet: CardSetOption) => void;
};

export function CardSetFields({
  value,
  options,
  disabled = false,
  onChange,
  onSetSaved,
}: CardSetFieldsProps) {
  const [savingSet, setSavingSet] = useState(false);
  const toast = useToast();
  const normalizedCode = value.set_code.trim().toUpperCase();
  const isCustomSelection = value.set_selection === "__custom__";
  const knownSet = isCustomSelection
    ? undefined
    : options.sets.find((set) => set.code === normalizedCode);
  const selectedSetValue = isCustomSelection
    ? "__custom__"
    : knownSet
      ? knownSet.code
      : value.set_code
        ? "__custom__"
        : "";
  const customSetIsComplete = Boolean(
    value.set_code.trim() && value.set_name.trim(),
  );

  function updateSetSelection(setCode: string) {
    if (setCode === "__custom__") {
      onChange({
        set_selection: "__custom__",
        set_code: "",
        set_name: "",
      });
      return;
    }

    const selectedSet = options.sets.find((set) => set.code === setCode);
    onChange({
      set_selection: setCode,
      set_code: setCode,
      set_name: selectedSet?.name ?? "",
    });
  }

  async function handleSaveSet() {
    if (!customSetIsComplete || savingSet) return;

    setSavingSet(true);
    try {
      const savedSet = await saveCardSet(
        value.set_code.trim(),
        value.set_name.trim(),
      );
      onSetSaved(savedSet);
      onChange({
        set_selection: savedSet.code,
        set_code: savedSet.code,
        set_name: savedSet.name,
      });
      toast.success(`${savedSet.code} is now available in every set dropdown.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save card set.",
      );
    } finally {
      setSavingSet(false);
    }
  }

  return (
    <>
      <FormSelect
        label="Card set"
        value={selectedSetValue}
        onChange={updateSetSelection}
        placeholder="Choose a card set"
        required
        options={[
          ...options.sets.map((set) => ({
            value: set.code,
            label: `${set.code} — ${set.name}`,
          })),
          { value: "__custom__", label: "Add a custom or unlisted set" },
        ]}
      />

      {selectedSetValue === "__custom__" ? (
        <>
          <FormTextInput
            label="Custom set code"
            value={value.set_code}
            onChange={(setCode) =>
              onChange({
                ...value,
                set_selection: "__custom__",
                set_code: setCode.toUpperCase(),
              })
            }
            placeholder="Example: DZ-SS15"
            required
          />

          <FormTextInput
            label="Custom set name"
            value={value.set_name}
            onChange={(setName) =>
              onChange({
                ...value,
                set_selection: "__custom__",
                set_name: setName,
              })
            }
            placeholder="Example: The Legendary Vanguards"
            required
          />

          <div className="flex flex-col justify-end rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.04] p-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">

            <button
              type="button"
              onClick={() => void handleSaveSet()}
              disabled={disabled || savingSet || !customSetIsComplete}
              className="mt-3 inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-45 sm:mt-0"
            >
              <BookmarkPlus className="h-4 w-4" />
              {savingSet ? "Saving set..." : "Save set to dropdown"}
            </button>
          </div>
        </>
      ) : (
        <FormTextInput
          label="Set name"
          value={value.set_name}
          onChange={(setName) => onChange({ ...value, set_name: setName })}
          placeholder="Select a card set first"
          required
          readOnly
        />
      )}
    </>
  );
}
