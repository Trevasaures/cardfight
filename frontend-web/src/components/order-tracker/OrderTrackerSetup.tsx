import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ArrowRight, Copy, PackagePlus, Sparkles, Wrench } from "lucide-react";

import { EMPTY_PURCHASE_DRAFT, type NewPurchaseDraft } from "./order-drafts";
import { getDeckVersions } from "../../api/deckBuilder";
import type {
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
  draft: NewPurchaseDraft;
  onDraftChange: Dispatch<SetStateAction<NewPurchaseDraft>>;
  onClose: () => void;
  onCreate: (payload: CreateAcquisitionPlanPayload) => Promise<boolean>;
  onError: (message: string) => void;
};

export function OrderTrackerSetup({
  decks,
  options,
  creating,
  draft,
  onDraftChange,
  onClose,
  onCreate,
  onError,
}: OrderTrackerSetupProps) {
  const {
    planType,
    listSource,
    name,
    deckType,
    nation,
    notes,
    selectedDeckId,
    selectedVersionId,
  } = draft;
  const updateField = useCallback(
    <K extends keyof NewPurchaseDraft>(
      field: K,
      value: SetStateAction<NewPurchaseDraft[K]>,
    ) => {
      onError("");
      onDraftChange((current) => ({
        ...current,
        [field]:
          typeof value === "function"
            ? (value as (old: NewPurchaseDraft[K]) => NewPurchaseDraft[K])(
                current[field],
              )
            : value,
      }));
    },
    [onDraftChange, onError],
  );
  const setSelectedVersionId = useCallback(
    (value: SetStateAction<string>) => updateField("selectedVersionId", value),
    [updateField],
  );
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
  }, [onError, selectedDeckId, setSelectedVersionId]);

  function choosePlanType(nextType: AcquisitionPlanType) {
    updateField("planType", nextType);

    if (nextType === "existing_deck") {
      updateField("listSource", "deck_version");
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

    const contextDeck =
      planType === "existing_deck" || listSource === "deck_version"
        ? selectedDeck
        : null;
    const payload: CreateAcquisitionPlanPayload = {
      name: cleanedName,
      plan_type: planType,
      list_source: listSource,
      build_mode: "physical",
      deck_type: contextDeck?.type ?? deckType,
      nation: contextDeck?.nation ?? (nation || null),
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
  }

  return (
    <form
      className="orders-setup-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={creating}>
        <div
          className="collection-segments mb-4"
          role="group"
          aria-label="Purpose of this purchase plan"
        >
          <button
            type="button"
            onClick={() => choosePlanType("new_build")}
            aria-pressed={planType === "new_build"}
          >
            <PackagePlus size={14} /> New build
          </button>
          <button
            type="button"
            onClick={() => choosePlanType("existing_deck")}
            aria-pressed={planType === "existing_deck"}
          >
            <Wrench size={14} /> Upgrade deck
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="collection-label">Plan name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              placeholder="Youthberk upgrades"
              className="workspace-control w-full"
            />
          </label>
          <label>
            <span className="collection-label">Notes</span>
            <input
              value={notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Optional"
              className="workspace-control w-full"
            />
          </label>
        </div>
        <div className="mt-4">
          <span className="collection-label">Starting list</span>
          <div
            className="collection-segments"
            role="group"
            aria-label="Starting card list"
          >
            <button
              type="button"
              onClick={() => updateField("listSource", "empty")}
              aria-pressed={listSource === "empty"}
            >
              <Sparkles size={14} />
              {planType === "new_build" ? "Empty" : "New purchases"}
            </button>
            <button
              type="button"
              onClick={() => updateField("listSource", "deck_version")}
              aria-pressed={listSource === "deck_version"}
            >
              <Copy size={14} />
              {planType === "new_build" ? "Copy version" : "Current deck"}
            </button>
          </div>
        </div>
        {planType === "existing_deck" || listSource === "deck_version" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="collection-label">Deck</span>
              <select
                value={selectedDeckId}
                onChange={(event) => {
                  setSelectedVersionId("");
                  updateField("selectedDeckId", event.target.value);
                }}
                className="workspace-control w-full"
              >
                <option value="">Choose a deck</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="collection-label">Version</span>
              <select
                value={selectedVersionId}
                onChange={(event) => setSelectedVersionId(event.target.value)}
                disabled={!selectedDeckId || loadingVersions}
                className="workspace-control w-full"
              >
                <option value="">
                  {loadingVersions ? "Loading…" : "Choose a version"}
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
            <label>
              <span className="collection-label">Format</span>
              <select
                value={deckType}
                onChange={(event) =>
                  updateField("deckType", event.target.value as DeckType)
                }
                className="workspace-control w-full"
              >
                {options.types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="collection-label">Nation</span>
              <select
                value={nation}
                onChange={(event) => updateField("nation", event.target.value)}
                className="workspace-control w-full"
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
        {listSource === "deck_version" && (
          <p className="collection-muted mt-3 mb-0">
            {planType === "existing_deck"
              ? "Current copies start on hand."
              : "Copied cards start unowned."}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              onDraftChange(EMPTY_PURCHASE_DRAFT);
            }}
            disabled={creating || (!name && !notes)}
            className="collection-button subtle"
          >
            Discard draft
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="collection-button subtle"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={
              creating ||
              !name.trim() ||
              ((planType === "existing_deck" ||
                listSource === "deck_version") &&
                (loadingVersions || !selectedVersionId))
            }
            className="collection-button primary"
          >
            {creating ? "Creating…" : "Create plan"}
            <ArrowRight />
          </button>
        </div>
      </fieldset>
    </form>
  );
}
