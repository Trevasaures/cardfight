import { useEffect, useMemo, useState } from "react";
import { Copy, PackagePlus, Sparkles, Wrench } from "lucide-react";

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
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200/75">
          New acquisition plan
        </p>
        <h3 className="mt-2 text-2xl font-black text-slate-50">
          What are these cards for?
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          A purchase plan can stand on its own, or stay connected to an
          existing deck that you are upgrading.
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => choosePlanType("new_build")}
          className={[
            "rounded-3xl border p-5 text-left transition",
            planType === "new_build"
              ? "border-cyan-300/50 bg-cyan-300/10"
              : "border-white/10 bg-black/20 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          <PackagePlus className="h-5 w-5 text-cyan-200" />
          <p className="mt-4 font-black text-slate-100">New physical build</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Start from nothing, or copy a list as a template without claiming
            that deck&apos;s owned cards.
          </p>
        </button>

        <button
          type="button"
          onClick={() => choosePlanType("existing_deck")}
          className={[
            "rounded-3xl border p-5 text-left transition",
            planType === "existing_deck"
              ? "border-violet-300/50 bg-violet-300/10"
              : "border-white/10 bg-black/20 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          <Wrench className="h-5 w-5 text-violet-200" />
          <p className="mt-4 font-black text-slate-100">
            Upgrade an existing deck
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Import the current list as owned, then mark only the cards leaving
            and the new pieces you need to order.
          </p>
        </button>
      </div>

      <div className="mt-6">
        <p className="text-sm font-bold text-slate-300">
          How should the card list begin?
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setListSource("empty")}
            className={[
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition",
              listSource === "empty"
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-black/20 text-slate-300",
            ].join(" ")}
          >
            <Sparkles className="h-4 w-4" />
            {planType === "new_build"
              ? "Start with an empty list"
              : "Track only new purchases"}
          </button>

          <button
            type="button"
            onClick={() => setListSource("deck_version")}
            className={[
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition",
              listSource === "deck_version"
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-black/20 text-slate-300",
            ].join(" ")}
          >
            <Copy className="h-4 w-4" />
            {planType === "new_build"
              ? "Copy an existing version"
              : "Import current version as owned"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">
            Purchase plan name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              planType === "new_build"
                ? "Example: New Youthberk build"
                : "Example: Finish Rotovisor upgrades"
            }
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">
            Build notes
          </span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional goal, deadline, or buying notes"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
          />
        </label>
      </div>

      {planType === "existing_deck" || listSource === "deck_version" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-slate-300">
              {planType === "existing_deck" ? "Existing deck" : "Template deck"}
            </span>
            <select
              value={selectedDeckId}
              onChange={(event) => setSelectedDeckId(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
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
            <span className="text-sm font-semibold text-slate-300">
              Deck list version
            </span>
            <select
              value={selectedVersionId}
              onChange={(event) => setSelectedVersionId(event.target.value)}
              disabled={!selectedDeckId || loadingVersions}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50 disabled:opacity-50"
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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-slate-300">Format</span>
            <select
              value={deckType}
              onChange={(event) => setDeckType(event.target.value as DeckType)}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
            >
              {options.types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-slate-300">
              Nation, if known
            </span>
            <select
              value={nation}
              onChange={(event) => setNation(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
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

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={creating}
          className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating plan..." : "Create purchase plan"}
        </button>
      </div>
    </section>
  );
}
