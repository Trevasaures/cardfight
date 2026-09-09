import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, PackagePlus, Sparkles, Wrench } from "lucide-react";

import { getDeckVersions } from "../../api/deckBuilder";
import type {
  AcquisitionListSource,
  AcquisitionPlanType,
  CreateAcquisitionPlanPayload,
  Deck,
  DeckOptionsResponse,
  DeckType,
  DeckVersionSummary,
} from "../../types/api";

type OrderTrackerSetupProps = {
  decks: Deck[];
  options: DeckOptionsResponse;
  creating: boolean;
  onCreate: (payload: CreateAcquisitionPlanPayload) => Promise<void>;
  onError: (message: string) => void;
};

export function OrderTrackerSetup({
  decks,
  options,
  creating,
  onCreate,
  onError,
}: OrderTrackerSetupProps) {
  const [planType, setPlanType] =
    useState<AcquisitionPlanType>("new_build");
  const [listSource, setListSource] =
    useState<AcquisitionListSource>("empty");
  const [name, setName] = useState("");
  const [deckType, setDeckType] = useState<DeckType>("Standard");
  const [nation, setNation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [versions, setVersions] = useState<DeckVersionSummary[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === Number(selectedDeckId)) ?? null,
    [decks, selectedDeckId],
  );

  useEffect(() => {
    if (!selectedDeckId) {
      setVersions([]);
      setSelectedVersionId("");
      return;
    }

    let cancelled = false;
    setLoadingVersions(true);

    getDeckVersions(Number(selectedDeckId))
      .then((rows) => {
        if (cancelled) return;
        setVersions(rows);
        setSelectedVersionId((current) => {
          if (rows.some((version) => String(version.id) === current)) {
            return current;
          }

          const active = rows.find((version) => version.is_active);
          return active ? String(active.id) : String(rows[0]?.id ?? "");
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setVersions([]);
        setSelectedVersionId("");
        onError(
          error instanceof Error ? error.message : "Failed to load versions",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onError, selectedDeckId]);

  function choosePlanType(nextType: AcquisitionPlanType) {
    setPlanType(nextType);

    if (nextType === "existing_deck") {
      setListSource("deck_version");
    }
  }

  async function submit() {
    const cleanedName = name.trim();
    if (!cleanedName) {
      onError("Give this purchase plan a name.");
      return;
    }

    if (
      (planType === "existing_deck" || listSource === "deck_version") &&
      !selectedVersionId
    ) {
      onError(
        planType === "existing_deck"
          ? "Choose the existing deck and version this plan belongs to."
          : "Choose the deck version that should provide the card list.",
      );
      return;
    }

    const payload: CreateAcquisitionPlanPayload = {
      name: cleanedName,
      plan_type: planType,
      list_source: listSource,
      build_mode: "physical",
      deck_type: selectedDeck?.type ?? deckType,
      nation: selectedDeck?.nation ?? (nation || null),
      notes: notes.trim(),
    };

    if (listSource === "deck_version") {
      payload.source_deck_version_id = Number(selectedVersionId);
    }

    if (planType === "existing_deck") {
      payload.deck_id = Number(selectedDeckId);
      payload.deck_version_id = Number(selectedVersionId);
    }

    await onCreate(payload);
    setName("");
    setNotes("");
  }

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-100">
          New plan
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-slate-50 sm:text-2xl">
            Plan your next build
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Choose what you are buying for, then set your starting list.
          </p>
        </div>
      </div>

      <div
        className="mt-4 grid gap-3 md:grid-cols-2"
        role="group"
        aria-label="Purpose of this purchase plan"
      >
        <button
          type="button"
          onClick={() => choosePlanType("new_build")}
          aria-pressed={planType === "new_build"}
          className={[
            "flex items-start gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:p-4",
            planType === "new_build"
              ? "border-cyan-300/40 bg-cyan-300/10"
              : "border-white/10 bg-black/20 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
            <PackagePlus className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-slate-100">
              New physical build
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-400">
              Buy a fresh deck or another copy. No cards are assumed owned.
            </span>
          </span>
          <span
            className={[
              "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              planType === "new_build"
                ? "border-cyan-300/50 bg-cyan-300/20 text-cyan-100"
                : "border-white/15",
            ].join(" ")}
          >
            {planType === "new_build" ? <Check className="h-3 w-3" /> : null}
          </span>
        </button>

        <button
          type="button"
          onClick={() => choosePlanType("existing_deck")}
          aria-pressed={planType === "existing_deck"}
          className={[
            "flex items-start gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 sm:p-4",
            planType === "existing_deck"
              ? "border-violet-300/40 bg-violet-300/10"
              : "border-white/10 bg-black/20 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-300/10 text-violet-200">
            <Wrench className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-slate-100">
              Upgrade an existing deck
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-400">
              Keep your current copies and plan the cards being added or replaced.
            </span>
          </span>
          <span
            className={[
              "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              planType === "existing_deck"
                ? "border-violet-300/50 bg-violet-300/20 text-violet-100"
                : "border-white/15",
            ].join(" ")}
          >
            {planType === "existing_deck" ? <Check className="h-3 w-3" /> : null}
          </span>
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <label className="grid gap-2">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
              Plan name <span className="text-cyan-200">*</span>
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder={
                planType === "new_build"
                  ? "Example: New Youthberk build"
                  : "Example: Rotovisor upgrades"
              }
              className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
              Notes{" "}
              <span className="font-normal normal-case tracking-normal">
                (optional)
              </span>
            </span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Goal, deadline, or buying notes"
              className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50"
            />
          </label>
        </div>

        <div className="border-t border-white/10 p-3 sm:p-4">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
            Starting card list
          </p>
          <div
            className="mt-2 grid gap-2 sm:grid-cols-2"
            role="group"
            aria-label="Starting card list"
          >
            <button
              type="button"
              onClick={() => setListSource("empty")}
              aria-pressed={listSource === "empty"}
              className={[
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300",
                listSource === "empty"
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
              ].join(" ")}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              {planType === "new_build"
                ? "Start with an empty list"
                : "Track only new purchases"}
            </button>

            <button
              type="button"
              onClick={() => setListSource("deck_version")}
              aria-pressed={listSource === "deck_version"}
              className={[
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300",
                listSource === "deck_version"
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
              ].join(" ")}
            >
              <Copy className="h-4 w-4 shrink-0" />
              {planType === "new_build"
                ? "Copy an existing version"
                : "Import current version as owned"}
            </button>
          </div>

          {planType === "existing_deck" || listSource === "deck_version" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {planType === "existing_deck" ? "Existing deck" : "Template deck"}
                </span>
                <select
                  value={selectedDeckId}
                  onChange={(event) => setSelectedDeckId(event.target.value)}
                  className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
                >
                  <option value="">Choose a deck</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Deck list version
                </span>
                <select
                  value={selectedVersionId}
                  onChange={(event) => setSelectedVersionId(event.target.value)}
                  disabled={!selectedDeckId || loadingVersions}
                  className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50 disabled:opacity-50"
                >
                  <option value="">
                    {loadingVersions ? "Loading versions..." : "Choose a version"}
                  </option>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.version_name}
                      {version.is_active ? " · Active" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Format
                </span>
                <select
                  value={deckType}
                  onChange={(event) => setDeckType(event.target.value as DeckType)}
                  className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
                >
                  {options.types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Nation, if known
                </span>
                <select
                  value={nation}
                  onChange={(event) => setNation(event.target.value)}
                  className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
                >
                  <option value="">Choose later</option>
                  {options.nations.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <p className="mt-3 text-xs leading-5 text-slate-500" aria-live="polite">
            {listSource === "deck_version"
              ? planType === "existing_deck"
                ? "Current-version cards start owned. Track replacements here, then publish a new version when the build is ready."
                : "Only the card list is copied. Ownership starts at zero so you can price a separate physical build."
              : planType === "existing_deck"
                ? "Your current deck stays as it is. Add only the new cards you want to purchase."
                : "No deck or version is required. Add cards from the catalog after creating this plan."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Quantities, printing choices, and prices can be updated as you go.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={creating}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating plan..." : "Create purchase plan"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
