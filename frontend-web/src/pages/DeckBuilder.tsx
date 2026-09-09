import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDeckBuilderMotion } from "../animations/useDeckBuilderMotion";
import {
  addCardPrinting,
  analyzeCardImage,
  createCard,
  getCardFormOptions,
  getCard,
  searchCards,
  updateCard,
  updateCardPrinting,
} from "../api/cards";
import {
  addCardToDeckVersion,
  createDeckVersion,
  deleteDeckVersion,
  getDeckVersion,
  getDeckVersions,
  removeDeckCard,
  updateDeckCard,
  updateDeckVersion,
} from "../api/deckBuilder";
import { getDecks } from "../api/decks";
import { CardCatalogPanel } from "../components/deck-builder/CardCatalogPanel";
import {
  clearCardSetSelection,
  replaceCardSetSelection,
} from "../components/cards/cardSetSelectionState";
import { DeckBuilderSetup } from "../components/deck-builder/DeckBuilderSetup";
import { DeckVersionComparison } from "../components/deck-builder/DeckVersionComparison";
import { DeckVersionContents } from "../components/deck-builder/DeckVersionContents";
import { useToast } from "../components/feedback/useToast";
import {
  DEFAULT_CARD_FORM_OPTIONS,
  EMPTY_MANUAL_CARD_FORM,
  cardAnalysisToManualForm,
  manualCardFormIsComplete,
  withSavedCardSet,
} from "../components/deck-builder/manualCardFormState";
import { PageHeader } from "../components/layout/PageHeader";
import { usePersistentState } from "../hooks/usePersistentState";
import type {
  Card,
  CardFormOptions,
  CardImageAnalysisResult,
  CardSetOption,
  CreateCardPayload,
  Deck,
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
  DeckVersionSummary,
} from "../types/api";
import {
  cardNationToApiValue,
  cardNationToFormValue,
} from "../utils/cards";

type CardFormMode = "create" | "edit";

const ZONES: { value: DeckCardZone; label: string }[] = [
  { value: "main", label: "Main deck" },
  { value: "ride", label: "Ride deck" },
  { value: "g", label: "G zone" },
  { value: "token", label: "Token" },
  { value: "other", label: "Other" },
];

export function DeckBuilder() {
  const builderRef = useRef<HTMLDivElement | null>(null);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [versions, setVersions] = useState<DeckVersionSummary[]>([]);
  const [currentVersion, setCurrentVersion] = useState<DeckVersion | null>(null);

  const [selectedDeckId, setSelectedDeckId] = usePersistentState(
    "cardfight.deck-builder.selected-deck",
    "",
  );
  const [selectedVersionId, setSelectedVersionId] = usePersistentState(
    "cardfight.deck-builder.selected-version",
    "",
  );
  const previousSelectedDeckIdRef = useRef(selectedDeckId);

  const [newVersionName, setNewVersionName] = usePersistentState(
    "cardfight.deck-builder.new-version-name",
    "",
  );
  const [newVersionNotes, setNewVersionNotes] = usePersistentState(
    "cardfight.deck-builder.new-version-notes",
    "",
  );
  const [newVersionSourceId, setNewVersionSourceId] = usePersistentState(
    "cardfight.deck-builder.new-version-source",
    "",
  );
  const [editVersionName, setEditVersionName] = usePersistentState(
    "cardfight.deck-builder.edit-version-name",
    "",
  );
  const [editVersionNotes, setEditVersionNotes] = usePersistentState(
    "cardfight.deck-builder.edit-version-notes",
    "",
  );
  const [editVersionDraftId, setEditVersionDraftId] = usePersistentState<
    number | null
  >("cardfight.deck-builder.edit-version-id", null);
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [showEditVersion, setShowEditVersion] = useState(false);
  const [comparisonBaselineId, setComparisonBaselineId] = usePersistentState(
    "cardfight.deck-builder.comparison-version",
    "",
  );
  const [comparisonBaseline, setComparisonBaseline] =
    useState<DeckVersion | null>(null);

  const [cardSearch, setCardSearch] = useState("");
  const [cardResults, setCardResults] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [selectedPrintingId, setSelectedPrintingId] = useState("");
  const [cardFormMode, setCardFormMode] = useState<CardFormMode>("create");
  const [cardAnalysis, setCardAnalysis] =
    useState<CardImageAnalysisResult | null>(null);
  const [analyzingCardImage, setAnalyzingCardImage] = useState(false);

  const [addQuantity, setAddQuantity] = usePersistentState(
    "cardfight.deck-builder.add-quantity",
    4,
  );
  const [addZone, setAddZone] = usePersistentState<DeckCardZone>(
    "cardfight.deck-builder.add-zone",
    "main",
  );

  const [newCard, setNewCard] = useState(EMPTY_MANUAL_CARD_FORM);
  const [cardFormOptions, setCardFormOptions] = useState<CardFormOptions>(
    DEFAULT_CARD_FORM_OPTIONS,
  );

  function handleSetSaved(cardSet: CardSetOption) {
    setCardFormOptions((current) => withSavedCardSet(current, cardSet));
  }

  function handleSetUpdated(previousCode: string, cardSet: CardSetOption) {
    setCardFormOptions((current) =>
      withSavedCardSet(
        {
          ...current,
          sets: current.sets.filter((option) => option.code !== previousCode),
        },
        cardSet,
      ),
    );
    setNewCard((current) =>
      replaceCardSetSelection(current, previousCode, cardSet),
    );
  }

  function handleSetDeleted(setCode: string) {
    setCardFormOptions((current) => ({
      ...current,
      sets: current.sets.filter((option) => option.code !== setCode),
    }));
    setNewCard((current) => clearCardSetSelection(current, setCode));
  }

  function rememberFormSet(
    setCode: string | null | undefined,
    setName: string | null | undefined,
  ) {
    const code = setCode?.trim().toUpperCase() ?? "";
    const name = setName?.trim() ?? "";
    if (code && name) handleSetSaved({ code, name });
  }

  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === Number(selectedDeckId)) ?? null,
    [decks, selectedDeckId],
  );

  const selectedCard = useMemo(
    () => cardResults.find((card) => card.id === Number(selectedCardId)) ?? null,
    [cardResults, selectedCardId],
  );

  useEffect(() => {
    setSelectedPrintingId((current) => {
      if (
        current &&
        selectedCard?.printings.some(
          (printing) => String(printing.id) === current,
        )
      ) {
        return current;
      }

      return selectedCard?.primary_printing
        ? String(selectedCard.primary_printing.id)
        : "";
    });
  }, [selectedCard]);

  const manualCardIsComplete = useMemo(() => {
    return manualCardFormIsComplete(newCard);
  }, [newCard]);

  const versionEditIsDirty = useMemo(() => {
    if (!currentVersion) return false;

    return (
      editVersionName.trim() !== currentVersion.version_name ||
      editVersionNotes.trim() !== currentVersion.notes
    );
  }, [currentVersion, editVersionName, editVersionNotes]);

  const groupedCards = useMemo(() => {
    const groups = new Map<DeckCardZone, DeckCardEntry[]>();

    for (const option of ZONES) {
      groups.set(option.value, []);
    }

    for (const entry of currentVersion?.cards ?? []) {
      const rows = groups.get(entry.zone) ?? [];
      rows.push(entry);
      groups.set(entry.zone, rows);
    }

    return groups;
  }, [currentVersion]);

  const deckBuilderMotionTrigger = [
    currentVersion?.id ?? "no-version",
    currentVersion?.card_count ?? 0,
    currentVersion?.unique_card_count ?? 0,
    comparisonBaseline?.id ?? "no-comparison",
    cardResults.length,
  ].join(":");

  useDeckBuilderMotion(builderRef, deckBuilderMotionTrigger);

  const loadDecks = useCallback(async () => {
    setError(null);
    setLoadingDecks(true);

    try {
      const rows = await getDecks(true);
      setDecks(rows);
      setSelectedDeckId((current) =>
        current || (rows[0] ? String(rows[0].id) : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks");
    } finally {
      setLoadingDecks(false);
    }
  }, [setSelectedDeckId]);

  const loadDeckVersions = useCallback(async (deckId: number) => {
    setError(null);
    setLoadingVersions(true);

    try {
      const rows = await getDeckVersions(deckId);
      setVersions(rows);

      setSelectedVersionId((current) => {
        if (rows.some((version) => String(version.id) === current)) {
          return current;
        }

        const activeVersion = rows.find((version) => version.is_active);

        return activeVersion
          ? String(activeVersion.id)
          : rows[0]
            ? String(rows[0].id)
            : "";
      });

      if (rows.length === 0) {
        setCurrentVersion(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deck versions");
    } finally {
      setLoadingVersions(false);
    }
  }, [setSelectedVersionId]);

  const loadCurrentVersion = useCallback(async (versionId: number) => {
    setError(null);

    try {
      const version = await getDeckVersion(versionId);
      setCurrentVersion(version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deck version");
    }
  }, []);

  const loadCardResults = useCallback(async () => {
    const query = cardSearch.trim();

    if (query.length < 2) {
      setCardResults([]);
      setSelectedCardId("");
      setError("Enter at least 2 characters before searching cards.");
      return;
    }

    setError(null);
    setLoadingCards(true);

    try {
      const rows = await searchCards({
        q: query,
        limit: 25,
      });

      setCardResults(rows);
      setSelectedCardId((current) =>
        current && rows.some((card) => String(card.id) === current)
          ? current
          : rows[0]
            ? String(rows[0].id)
            : "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search cards");
    } finally {
      setLoadingCards(false);
    }
  }, [cardSearch]);

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  useEffect(() => {
    getCardFormOptions()
      .then(setCardFormOptions)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load card form options",
        );
      });
  }, []);

  useEffect(() => {
    if (!selectedDeckId) {
      setVersions([]);
      setCurrentVersion(null);
      setSelectedVersionId("");
      return;
    }

    const previousDeckId = previousSelectedDeckIdRef.current;
    const changedDecks =
      Boolean(previousDeckId) && previousDeckId !== selectedDeckId;
    previousSelectedDeckIdRef.current = selectedDeckId;

    if (changedDecks) {
      setNewVersionName("");
      setNewVersionNotes("");
    }

    setNewVersionSourceId("");
    setShowCreateVersion(false);
    setShowEditVersion(false);
    void loadDeckVersions(Number(selectedDeckId));
  }, [
    selectedDeckId,
    loadDeckVersions,
    setNewVersionName,
    setNewVersionNotes,
    setNewVersionSourceId,
    setSelectedVersionId,
  ]);

  useEffect(() => {
    if (!selectedVersionId) {
      setCurrentVersion(null);
      return;
    }

    setShowCreateVersion(false);
    setShowEditVersion(false);
    void loadCurrentVersion(Number(selectedVersionId));
  }, [selectedVersionId, loadCurrentVersion]);

  useEffect(() => {
    const currentId = Number(selectedVersionId) || currentVersion?.id;
    const availableBaselines = versions.filter(
      (version) => version.id !== currentId,
    );

    setComparisonBaselineId((current) => {
      if (
        current &&
        availableBaselines.some((version) => String(version.id) === current)
      ) {
        return current;
      }

      return availableBaselines[0] ? String(availableBaselines[0].id) : "";
    });

    if (availableBaselines.length === 0) {
      setComparisonBaseline(null);
    }
  }, [
    currentVersion?.id,
    selectedVersionId,
    setComparisonBaselineId,
    versions,
  ]);

  useEffect(() => {
    if (!comparisonBaselineId) {
      setComparisonBaseline(null);
      setLoadingComparison(false);
      return;
    }

    let cancelled = false;
    setLoadingComparison(true);

    getDeckVersion(Number(comparisonBaselineId))
      .then((version) => {
        if (!cancelled) setComparisonBaseline(version);
      })
      .catch((err) => {
        if (!cancelled) {
          setComparisonBaseline(null);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load comparison version",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingComparison(false);
      });

    return () => {
      cancelled = true;
    };
  }, [comparisonBaselineId]);

  useEffect(() => {
    if (!currentVersion) return;
    if (editVersionDraftId === currentVersion.id) return;

    setEditVersionName(currentVersion.version_name);
    setEditVersionNotes(currentVersion.notes);
    setEditVersionDraftId(currentVersion.id);
  }, [
    currentVersion,
    editVersionDraftId,
    setEditVersionDraftId,
    setEditVersionName,
    setEditVersionNotes,
  ]);

  function handleClearCardSearch() {
    setCardSearch("");
    setCardResults([]);
    setSelectedCardId("");
    setCardAnalysis(null);
    setError(null);

    if (cardFormMode === "edit") {
      setCardFormMode("create");
      setNewCard(EMPTY_MANUAL_CARD_FORM);
    }
  }

  function handleEditSelectedCard() {
    if (!selectedCard) return;

    const printing = selectedCard.primary_printing;

    setNewCard({
      name: selectedCard.name,
      grade: selectedCard.grade !== null ? String(selectedCard.grade) : "",
      nation: cardNationToFormValue(selectedCard.nation),
      card_type: selectedCard.card_type,
      set_selection: printing?.set_code ?? "",
      set_code: printing?.set_code ?? "",
      set_name: printing?.set_name ?? "",
      card_number: printing?.card_number ?? "",
      rarity: printing?.rarity ?? "",
    });

    setCardAnalysis(null);
    setCardFormMode("edit");
    setError(null);
  }

  function handleCancelCardEdit() {
    setCardFormMode("create");
    setNewCard(EMPTY_MANUAL_CARD_FORM);
    setCardAnalysis(null);
    setError(null);
  }

  function applyCardAnalysisToForm(result: CardImageAnalysisResult) {
    setNewCard(cardAnalysisToManualForm(result));

    setCardFormMode("create");
    setError(null);
  }

  async function handleAnalyzeCardImage(file: File) {
    setAnalyzingCardImage(true);
    setCardAnalysis(null);
    setError(null);

    try {
      const result = await analyzeCardImage(file);
      setCardAnalysis(result);
      applyCardAnalysisToForm(result);
      toast.success("Card image analyzed and its suggested fields were applied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze card image");
    } finally {
      setAnalyzingCardImage(false);
    }
  }

  function handleApplyCardAnalysis() {
    if (!cardAnalysis) return;
    applyCardAnalysisToForm(cardAnalysis);
  }

  async function handleCreateVersion() {
    const versionName = newVersionName.trim();
    if (!selectedDeck || !versionName) return;

    setSaving(true);
    setError(null);

    try {
      const version = await createDeckVersion(selectedDeck.id, {
        version_name: versionName,
        notes: newVersionNotes.trim(),
        is_active: true,
        source_version_id: newVersionSourceId
          ? Number(newVersionSourceId)
          : undefined,
      });

      setNewVersionName("");
      setNewVersionNotes("");
      setNewVersionSourceId("");
      setShowCreateVersion(false);
      setCurrentVersion(version);
      setSelectedVersionId(String(version.id));
      await loadDeckVersions(selectedDeck.id);
      toast.success(`Created ${version.version_name} as the active deck version.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deck version");
    } finally {
      setSaving(false);
    }
  }

  function handleAddZoneChange(zone: DeckCardZone) {
    setAddZone(zone);
    setAddQuantity((current) => {
      if (zone === "ride") return 1;
      if (addZone === "ride" && current === 1) return 4;
      return current;
    });
  }

  async function handleSaveVersionDetails() {
    if (!currentVersion || !editVersionName.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await updateDeckVersion(currentVersion.id, {
        version_name: editVersionName.trim(),
        notes: editVersionNotes.trim(),
      });

      setCurrentVersion(updated);
      setShowEditVersion(false);
      await loadDeckVersions(updated.deck_id);
      toast.success(`Saved details for ${updated.version_name}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update deck version",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleActivateVersion() {
    if (!currentVersion || currentVersion.is_active) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await updateDeckVersion(currentVersion.id, {
        is_active: true,
      });
      setCurrentVersion(updated);
      await loadDeckVersions(updated.deck_id);
      toast.success(`${updated.version_name} is now the active deck version.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to activate deck version",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVersion() {
    if (!currentVersion || currentVersion.is_active) return;

    const deletedName = currentVersion.version_name;
    const deckId = currentVersion.deck_id;
    setSaving(true);
    setError(null);

    try {
      await deleteDeckVersion(currentVersion.id);
      setCurrentVersion(null);
      setSelectedVersionId("");
      setShowEditVersion(false);
      await loadDeckVersions(deckId);
      toast.success(`Deleted ${deletedName}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete deck version",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCardForm() {
    if (!manualCardIsComplete) {
      setError("All manual card fields are required before saving a card.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const cardPayload: CreateCardPayload = {
        name: newCard.name,
        grade: newCard.grade,
        nation: cardNationToApiValue(newCard.nation),
        card_type: newCard.card_type,
      };

      if (cardFormMode === "edit" && selectedCard) {
        await updateCard(selectedCard.id, cardPayload);

        if (selectedCard.primary_printing) {
          await updateCardPrinting(selectedCard.primary_printing.id, {
            set_code: newCard.set_code,
            set_name: newCard.set_name,
            card_number: newCard.card_number,
            rarity: newCard.rarity,
          });
        } else {
          await addCardPrinting(selectedCard.id, {
            set_code: newCard.set_code,
            set_name: newCard.set_name,
            card_number: newCard.card_number,
            rarity: newCard.rarity,
          });
        }

        const refreshedCard = await getCard(selectedCard.id);

        setCardResults((rows) =>
          rows.map((card) =>
            card.id === refreshedCard.id ? refreshedCard : card,
          ),
        );
        setSelectedCardId(String(refreshedCard.id));

        if (currentVersion) {
          await loadCurrentVersion(currentVersion.id);
        }

        rememberFormSet(
          refreshedCard.primary_printing?.set_code,
          refreshedCard.primary_printing?.set_name,
        );
        setNewCard(EMPTY_MANUAL_CARD_FORM);
        setCardFormMode("create");
        toast.success(`Updated ${refreshedCard.name}.`);
        return;
      }

      const created = await createCard({
        ...cardPayload,
        set_code: newCard.set_code,
        set_name: newCard.set_name,
        card_number: newCard.card_number,
        rarity: newCard.rarity,
      });

      setCardResults((rows) => [created, ...rows]);
      setSelectedCardId(String(created.id));
      rememberFormSet(
        created.primary_printing?.set_code,
        created.primary_printing?.set_name,
      );
      setNewCard(EMPTY_MANUAL_CARD_FORM);
      setCardFormMode("create");
      setCardAnalysis(null);
      toast.success(`Created ${created.name} and added it to the card catalog.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCardToVersion() {
    if (!currentVersion || !selectedCard) return;

    setSaving(true);
    setError(null);

    try {
      await addCardToDeckVersion(currentVersion.id, {
        card_id: selectedCard.id,
        printing_id: selectedPrintingId ? Number(selectedPrintingId) : null,
        quantity: addQuantity,
        zone: addZone,
      });

      await loadCurrentVersion(currentVersion.id);
      toast.success(
        `Added ${addQuantity} cop${addQuantity === 1 ? "y" : "ies"} of ${selectedCard.name} to the ${addZone} deck zone.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card to deck");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuantityChange(entry: DeckCardEntry, nextQuantity: number) {
    if (nextQuantity <= 0) return;

    setSaving(true);
    setError(null);

    try {
      await updateDeckCard(entry.id, {
        quantity: nextQuantity,
      });

      await loadCurrentVersion(entry.deck_version_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update quantity");
    } finally {
      setSaving(false);
    }
  }

  async function handlePrintingChange(
    entry: DeckCardEntry,
    nextPrintingId: string,
  ) {
    setSaving(true);
    setError(null);

    try {
      await updateDeckCard(entry.id, {
        printing_id: nextPrintingId ? Number(nextPrintingId) : null,
      });

      await loadCurrentVersion(entry.deck_version_id);
      toast.success(`Updated the printing used for ${entry.card?.name ?? "this card"}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update card printing",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCard(entry: DeckCardEntry) {
    setSaving(true);
    setError(null);

    try {
      await removeDeckCard(entry.id);
      await loadCurrentVersion(entry.deck_version_id);
      toast.success(`Removed ${entry.card?.name ?? "the card"} from this version.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={builderRef}>
      <PageHeader
        eyebrow="Deck Builder"
        title="Build and version your decks"
        description="Create deck versions, add card entries, and start turning match history into real deck testing data."
      />

      <div className="mb-5 inline-flex max-w-full items-center gap-2.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.65)]" />
        <p className="truncate text-xs font-bold text-emerald-100">
          Workspace restores automatically
        </p>
        <p className="hidden text-xs text-slate-500 lg:block">
          Deck, version, comparison, and unsaved details are remembered here.
        </p>
      </div>

      <div className="space-y-4">
        <DeckBuilderSetup
          decks={decks}
          versions={versions}
          currentVersion={currentVersion}
          selectedDeck={selectedDeck}
          selectedDeckId={selectedDeckId}
          selectedVersionId={selectedVersionId}
          newVersionName={newVersionName}
          newVersionNotes={newVersionNotes}
          newVersionSourceId={newVersionSourceId}
          editVersionName={editVersionName}
          editVersionNotes={editVersionNotes}
          versionEditIsDirty={versionEditIsDirty}
          showCreateVersion={showCreateVersion}
          showEditVersion={showEditVersion}
          loadingDecks={loadingDecks}
          loadingVersions={loadingVersions}
          saving={saving}
          onSelectedDeckIdChange={setSelectedDeckId}
          onSelectedVersionIdChange={setSelectedVersionId}
          onNewVersionNameChange={setNewVersionName}
          onNewVersionNotesChange={setNewVersionNotes}
          onNewVersionSourceIdChange={setNewVersionSourceId}
          onEditVersionNameChange={setEditVersionName}
          onEditVersionNotesChange={setEditVersionNotes}
          onShowCreateVersion={() => {
            setShowEditVersion(false);
            setShowCreateVersion(true);
          }}
          onCancelCreateVersion={() => {
            setShowCreateVersion(false);
            setNewVersionName("");
            setNewVersionNotes("");
            setNewVersionSourceId("");
          }}
          onShowEditVersion={() => {
            setShowCreateVersion(false);
            setShowEditVersion(true);
          }}
          onCancelEditVersion={() => {
            setShowEditVersion(false);
            setEditVersionName(currentVersion?.version_name ?? "");
            setEditVersionNotes(currentVersion?.notes ?? "");
          }}
          onRefreshDecks={loadDecks}
          onRefreshVersions={() =>
            selectedDeck ? void loadDeckVersions(selectedDeck.id) : undefined
          }
          onCreateVersion={handleCreateVersion}
          onSaveVersionDetails={handleSaveVersionDetails}
          onActivateVersion={handleActivateVersion}
          onDeleteVersion={handleDeleteVersion}
        />

        <DeckVersionComparison
          versions={versions}
          currentVersion={currentVersion}
          baselineVersion={comparisonBaseline}
          selectedBaselineId={comparisonBaselineId}
          loading={loadingComparison}
          onSelectedBaselineIdChange={setComparisonBaselineId}
        />

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
          <CardCatalogPanel
            cardSearch={cardSearch}
            cardResults={cardResults}
            selectedCard={selectedCard}
            selectedCardId={selectedCardId}
            newCard={newCard}
            cardFormMode={cardFormMode}
            analysisResult={cardAnalysis}
            analyzingImage={analyzingCardImage}
            loadingCards={loadingCards}
            saving={saving}
            manualCardIsComplete={manualCardIsComplete}
            cardFormOptions={cardFormOptions}
            onCardSearchChange={setCardSearch}
            onSearch={loadCardResults}
            onClearCardSearch={handleClearCardSearch}
            onSelectedCardIdChange={setSelectedCardId}
            onNewCardChange={setNewCard}
            onSaveCardForm={handleSaveCardForm}
            onEditSelectedCard={handleEditSelectedCard}
            onCancelCardEdit={handleCancelCardEdit}
            onAnalyzeCardImage={handleAnalyzeCardImage}
            onApplyCardAnalysis={handleApplyCardAnalysis}
            onSetSaved={handleSetSaved}
            onSetUpdated={handleSetUpdated}
            onSetDeleted={handleSetDeleted}
          />

          <DeckVersionContents
            currentVersion={currentVersion}
            groupedCards={groupedCards}
            cardResults={cardResults}
            selectedCardId={selectedCardId}
            selectedPrintingId={selectedPrintingId}
            addQuantity={addQuantity}
            addZone={addZone}
            saving={saving}
            selectedCard={selectedCard}
            onSelectedCardIdChange={setSelectedCardId}
            onSelectedPrintingIdChange={setSelectedPrintingId}
            onAddQuantityChange={setAddQuantity}
            onAddZoneChange={handleAddZoneChange}
            onAddCardToVersion={handleAddCardToVersion}
            onQuantityChange={handleQuantityChange}
            onPrintingChange={handlePrintingChange}
            onRemoveCard={handleRemoveCard}
          />
        </div>
      </div>
    </div>
  );
}
