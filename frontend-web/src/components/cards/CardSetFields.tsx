import { BookmarkPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { saveCardSet } from "../../api/cards";
import type { CardFormOptions, CardSetOption } from "../../types/api";
import { useToast } from "../feedback/useToast";
import { FormSelect, FormTextInput } from "../forms/HelpfulField";
import type { CardSetFormValue } from "./cardSetSelectionState";

type CardSetFieldsProps = {
  value: CardSetFormValue;
  options: CardFormOptions;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: CardSetFormValue) => void;
  onSetSaved: (cardSet: CardSetOption) => void;
};

export function CardSetFields({
  value,
  options,
  disabled = false,
  required = true,
  onChange,
  onSetSaved,
}: CardSetFieldsProps) {
  const [savingSet, setSavingSet] = useState(false);
  const toast = useToast();
  const mounted = useRef(false);
  const callbacks = useRef({ onChange, onSetSaved, value, toast });

  useEffect(() => {
    callbacks.current = { onChange, onSetSaved, value, toast };
  }, [onChange, onSetSaved, value, toast]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

    const requestedCode = value.set_code.trim();
    const requestedName = value.set_name.trim();
    setSavingSet(true);
    try {
      const savedSet = await saveCardSet(requestedCode, requestedName);
      // Switching printings unmounts this form. An old request must never write
      // into the next printing's draft or revert edits made while it was saving.
      if (!mounted.current) return;
      const latest = callbacks.current;
      latest.onSetSaved(savedSet);
      if (
        latest.value.set_code.trim() === requestedCode &&
        latest.value.set_name.trim() === requestedName
      ) {
        latest.onChange({
          set_selection: savedSet.code,
          set_code: savedSet.code,
          set_name: savedSet.name,
        });
      }
      latest.toast.success(
        `${savedSet.code} is now available in every set dropdown.`,
      );
    } catch (error) {
      if (!mounted.current) return;
      callbacks.current.toast.error(
        error instanceof Error ? error.message : "Failed to save card set.",
      );
    } finally {
      if (mounted.current) setSavingSet(false);
    }
  }

  return (
    <>
      <FormSelect
        label="Card set"
        value={selectedSetValue}
        onChange={updateSetSelection}
        placeholder="Choose a card set"
        required={required}
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
            required={required}
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
            required={required}
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
          required={required}
          readOnly
        />
      )}
    </>
  );
}
