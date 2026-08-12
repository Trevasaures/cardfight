import { PencilLine, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  deleteCardSet,
  getManagedCardSets,
  updateCardSet,
} from "../../api/cards";
import type { CardSetOption, ManagedCardSet } from "../../types/api";
import { useToast } from "../feedback/useToast";
import { FormSelect, FormTextInput } from "../forms/HelpfulField";

type CardSetManagerProps = {
  refreshToken: string;
  onSetUpdated: (previousCode: string, cardSet: CardSetOption) => void;
  onSetDeleted: (setCode: string) => void;
};

export function CardSetManager({
  refreshToken,
  onSetUpdated,
  onSetDeleted,
}: CardSetManagerProps) {
  const [sets, setSets] = useState<ManagedCardSet[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [setCode, setSetCode] = useState("");
  const [setName, setSetName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const selectedSet = useMemo(
    () => sets.find((cardSet) => cardSet.code === selectedCode) ?? null,
    [selectedCode, sets],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    getManagedCardSets()
      .then((rows) => {
        if (active) setSets(rows);
      })
      .catch((error) => {
        if (active) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load reusable card sets.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken, toast]);

  function chooseSet(code: string) {
    setSelectedCode(code);
    const selected = sets.find((cardSet) => cardSet.code === code);
    setSetCode(selected?.code ?? "");
    setSetName(selected?.name ?? "");
  }

  async function handleUpdate() {
    if (!selectedSet || !setCode.trim() || !setName.trim() || saving) return;

    const nextCode = setCode.trim().toUpperCase();
    const nextName = setName.trim();
    const hasChanges =
      nextCode !== selectedSet.code || nextName !== selectedSet.name;
    if (!hasChanges) return;

    if (
      selectedSet.usage_count > 0 &&
      !window.confirm(
        `Update ${selectedSet.code} and its ${selectedSet.usage_count} linked card printing(s)?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const updated = await updateCardSet(
        selectedSet.code,
        nextCode,
        nextName,
      );
      setSets((current) =>
        current
          .map((cardSet) =>
            cardSet.code === selectedSet.code ? updated : cardSet,
          )
          .sort((left, right) => left.code.localeCompare(right.code)),
      );
      setSelectedCode(updated.code);
      setSetCode(updated.code);
      setSetName(updated.name);
      onSetUpdated(selectedSet.code, updated);
      toast.success(
        updated.usage_count
          ? `Updated ${updated.code} and ${updated.usage_count} linked printing(s).`
          : `Updated ${updated.code}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update card set.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedSet || selectedSet.usage_count > 0 || saving) return;
    if (
      !window.confirm(
        `Delete the unused set ${selectedSet.code} — ${selectedSet.name}?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await deleteCardSet(selectedSet.code);
      setSets((current) =>
        current.filter((cardSet) => cardSet.code !== selectedSet.code),
      );
      onSetDeleted(selectedSet.code);
      setSelectedCode("");
      setSetCode("");
      setSetName("");
      toast.success(`Deleted unused set ${selectedSet.code}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete card set.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-slate-100">
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-cyan-200" />
          Manage reusable card sets
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.65rem] font-bold text-slate-500">
          {sets.length} custom
        </span>
      </summary>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Set codes are unique. Renaming updates every linked printing; deletion
        is limited to unused sets so catalog data cannot be orphaned.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading custom sets...</p>
      ) : sets.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormSelect
              label="Reusable set"
              help="Choose a custom or historically entered set to update or remove. Built-in sets are protected."
              value={selectedCode}
              onChange={chooseSet}
              placeholder="Choose a custom set"
              options={sets.map((cardSet) => ({
                value: cardSet.code,
                label: `${cardSet.code} — ${cardSet.name}`,
              }))}
            />
          </div>

          {selectedSet ? (
            <>
              <FormTextInput
                label="Set code"
                help="Changing this code updates every linked card printing after confirmation."
                value={setCode}
                onChange={(value) => setSetCode(value.toUpperCase())}
                placeholder="Example: DZ-SS15"
                required
              />
              <FormTextInput
                label="Set name"
                help="Changing this name updates every linked card printing after confirmation."
                value={setName}
                onChange={setSetName}
                placeholder="Enter the product name"
                required
              />

              <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-slate-500 sm:col-span-2">
                {selectedSet.usage_count > 0 ? (
                  <>
                    Used by <strong className="text-slate-300">{selectedSet.usage_count}</strong>{" "}
                    card printing(s). Updating will keep those records synchronized;
                    deletion is disabled.
                  </>
                ) : (
                  "This set is unused and can be safely updated or deleted."
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={saving || selectedSet.usage_count > 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-4 py-2.5 text-xs font-black text-rose-100 transition hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    selectedSet.usage_count > 0
                      ? "Sets used by card printings cannot be deleted"
                      : "Delete this unused custom set"
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Delete unused set
                </button>
                <button
                  type="button"
                  onClick={() => void handleUpdate()}
                  disabled={
                    saving ||
                    !setCode.trim() ||
                    !setName.trim() ||
                    (setCode.trim().toUpperCase() === selectedSet.code &&
                      setName.trim() === selectedSet.name)
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PencilLine className="h-4 w-4" />
                  {saving ? "Saving..." : "Save set changes"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-500">
          No custom sets have been saved yet.
        </p>
      )}
    </details>
  );
}
