import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDeckBuilderMotion } from "../animations/useDeckBuilderMotion";
import {
  createCard,
  getCardFormOptions,
  getCard,
  searchCards,
  updateCard,
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
import { DeckCardComposer } from "../components/deck-builder/DeckCardComposer";
import {
  cardAdditionIssue,
  suggestedDeckCardZone,
} from "../components/deck-builder/deckCardSelection";
import { CardInspector } from "../components/cards/CardInspector";
import { ManualCardForm } from "../components/deck-builder/ManualCardForm";
import "../components/collection-workspace.css";
import { CardCatalogPanel } from "../components/deck-builder/CardCatalogPanel";
import { artworkPayload } from "../components/cards/cardArtworkState";
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
  manualCardFormIsComplete,
  cardToManualForm,
  withSavedCardSet,
} from "../components/deck-builder/manualCardFormState";
import { PageHeader } from "../components/layout/PageHeader";
import { usePersistentState } from "../hooks/usePersistentState";
import type {
  Card,
  CardPrinting,
  CardFormOptions,
  CardSetOption,
  CreateCardPayload,
  Deck,
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
  DeckVersionSummary,
} from "../types/api";
import {
  cardGradeToApiValue,
  cardNationToApiValue,
  isCrestCard,
} from "../utils/cards";

type CardFormMode = "create" | "edit";

const ZONES: { value: DeckCardZone; label: string }[] = [
  { value: "main", label: "Main deck" },
  { value: "ride", label: "Ride deck" },
  { value: "g", label: "G zone" },
  { value: "crest", label: "Crests" },
  { value: "token", label: "Token" },
  { value: "other", label: "Other" },
];

export function DeckBuilder() {
  const builderRef = useRef<HTMLDivElement | null>(null);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [versions, setVersions] = useState<DeckVersionSummary[]>([]);
  const [currentVersion, setCurrentVersion] = useState<DeckVersion | null>(
    null,
  );

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

  const [cardSearch, setCardSearch] = usePersistentState(
    "cardfight.deck-builder.card-search",
    "",
  );
  const [cardResults, setCardResults] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = usePersistentState(
    "cardfight.deck-builder.selected-card",
    "",
  );
  const [selectedPrintingId, setSelectedPrintingId] = useState("");
  const [cardFormMode, setCardFormMode] = usePersistentState<CardFormMode>(
    "cardfight.deck-builder.card-mode",
    "create",
  );
  const [editingCardSnapshot, setEditingCardSnapshot] =
    usePersistentState<Card | null>(
      "cardfight.deck-builder.editing-card",
      null,
    );
  const [inspectedCard, setInspectedCard] = useState<{
    card: Card;
    printing?: CardPrinting | null;
  } | null>(null);
  const initialCatalogSearchRef = useRef(false);
  const currentVersionIdRef = useRef<number | null>(null);
  const selectedVersionIdRef = useRef(selectedVersionId);
  const versionRequestRef = useRef(0);

  const [addQuantity, setAddQuantity] = usePersistentState(
    "cardfight.deck-builder.add-quantity",
    4,
  );
  const [addZone, setAddZone] = usePersistentState<DeckCardZone>(
    "cardfight.deck-builder.add-zone",
    "main",
  );

  const [newCard, setNewCard] = usePersistentState(
    "cardfight.deck-builder.card-draft",
    EMPTY_MANUAL_CARD_FORM,
  );
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
    if (!error || inspectedCard) return;
    toast.error(error);
    setError(null);
  }, [error, toast, inspectedCard]);

  useEffect(() => {
    currentVersionIdRef.current = currentVersion?.id ?? null;
    selectedVersionIdRef.current = selectedVersionId;
  }, [currentVersion?.id, selectedVersionId]);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === Number(selectedDeckId)) ?? null,
    [decks, selectedDeckId],
  );

  const selectedCard = useMemo(
    () =>
      cardResults.find((card) => card.id === Number(selectedCardId)) ?? null,
    [cardResults, selectedCardId],
  );

  useEffect(() => {
    if (!selectedCard) return;
    setAddZone((current) => suggestedDeckCardZone(selectedCard, current));
    if (isCrestCard(selectedCard)) setAddQuantity(1);
  }, [selectedCard, setAddZone, setAddQuantity]);

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
      setSelectedDeckId(
        (current) => current || (rows[0] ? String(rows[0].id) : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks");
    } finally {
      setLoadingDecks(false);
    }
  }, [setSelectedDeckId]);

  const loadDeckVersions = useCallback(
    async (deckId: number) => {
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
        setError(
          err instanceof Error ? err.message : "Failed to load deck versions",
        );
      } finally {
        setLoadingVersions(false);
      }
    },
    [setSelectedVersionId],
  );

  const loadCurrentVersion = useCallback(async (versionId: number) => {
    const request = ++versionRequestRef.current;
    const isCurrentRequest = () =>
      request === versionRequestRef.current &&
      versionId === Number(selectedVersionIdRef.current);
    setError(null);

    try {
      const version = await getDeckVersion(versionId);
      // Undo can refresh a list while the user switches to another version.
      if (isCurrentRequest()) setCurrentVersion(version);
    } catch (err) {
      if (isCurrentRequest())
        setError(
          err instanceof Error ? err.message : "Failed to load deck version",
        );
    }
  }, []);

  useEffect(() => {
    const refreshRestoredVersion = (event: Event) => {
      const versionId = (event as CustomEvent<number>).detail;
      if (versionId === currentVersionIdRef.current)
        void loadCurrentVersion(versionId);
    };
    window.addEventListener(
      "cardfight:deck-version-restored",
      refreshRestoredVersion,
    );
    return () =>
      window.removeEventListener(
        "cardfight:deck-version-restored",
        refreshRestoredVersion,
      );
  }, [loadCurrentVersion]);

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
        limit: 100,
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
  }, [cardSearch, setSelectedCardId]);

  useEffect(() => {
    if (initialCatalogSearchRef.current) return;
    initialCatalogSearchRef.current = true;
    if (cardSearch.trim().length >= 2) void loadCardResults();
  }, [cardSearch, loadCardResults]);

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  useEffect(() => {
    getCardFormOptions()
      .then(setCardFormOptions)
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load card form options",
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
    setError(null);
  }

  function handleEditSelectedCard() {
    if (!selectedCard) return;
    startCardEdit(selectedCard);
  }

  function startCardEdit(card: Card) {
    if (editingCardSnapshot?.id === card.id && cardFormMode === "edit") {
      setInspectedCard({ card: editingCardSnapshot });
      return;
    }
    const baseline =
      cardFormMode === "edit" && editingCardSnapshot
        ? cardToManualForm(editingCardSnapshot)
        : EMPTY_MANUAL_CARD_FORM;
    if (
      JSON.stringify(newCard) !== JSON.stringify(baseline) &&
      !window.confirm("Discard the unfinished card edit?")
    )
      return;
    setNewCard(cardToManualForm(card));
    setEditingCardSnapshot(card);
    setInspectedCard({ card });
    setCardFormMode("edit");
    setError(null);
  }

  function handleCancelCardEdit() {
    setCardFormMode("create");
    setNewCard(EMPTY_MANUAL_CARD_FORM);
    setEditingCardSnapshot(null);
    setInspectedCard(null);
    setError(null);
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
      toast.success(
        `Created ${version.version_name} as the active deck version.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create deck version",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleAddZoneChange(zone: DeckCardZone) {
    setAddZone(zone);
    setAddQuantity((current) => {
      if (zone === "ride" || zone === "crest") return 1;
      if ((addZone === "ride" || addZone === "crest") && current === 1)
        return 4;
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
    if (cardFormMode === "edit" && !editingCardSnapshot) {
      setError("Open the card you want to edit first.");
      return;
    }
    if (!manualCardIsComplete) {
      setError("Complete the required fields before saving a card.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const cardPayload: CreateCardPayload = {
        name: newCard.name,
        grade: cardGradeToApiValue(newCard),
        nation: cardNationToApiValue(newCard.nation),
        card_type: newCard.card_type,
        skill_text: newCard.skill_text,
      };
      const printingPayload = {
        set_code: newCard.set_code,
        set_name: newCard.set_name,
        card_number: newCard.card_number,
        rarity: newCard.rarity,
        ...artworkPayload(newCard.artwork),
      };

      if (cardFormMode === "edit" && editingCardSnapshot) {
        await updateCard(editingCardSnapshot.id, {
          ...cardPayload,
          printing: printingPayload,
        });

        const refreshedCard = await getCard(editingCardSnapshot.id);

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
        setEditingCardSnapshot(null);
        setInspectedCard(null);
        toast.success(`Updated ${refreshedCard.name}.`);
        return;
      }

      const created = await createCard({
        ...cardPayload,
        ...printingPayload,
      });

      setCardResults((rows) => [created, ...rows]);
      setSelectedCardId(String(created.id));
      rememberFormSet(
        created.primary_printing?.set_code,
        created.primary_printing?.set_name,
      );
      setNewCard(EMPTY_MANUAL_CARD_FORM);
      setCardFormMode("create");
      toast.success(
        `Created ${created.name} and added it to the card catalog.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCardToVersion() {
    if (!currentVersion || !selectedCard) return;
    const destination = suggestedDeckCardZone(selectedCard, addZone);
    const quantity = isCrestCard(selectedCard) ? 1 : addQuantity;
    const issue = cardAdditionIssue(
      currentVersion,
      selectedCard,
      destination,
      quantity,
    );
    if (issue) {
      setError(issue);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await addCardToDeckVersion(currentVersion.id, {
        card_id: selectedCard.id,
        printing_id: selectedPrintingId ? Number(selectedPrintingId) : null,
        quantity,
        zone: destination,
      });

      setAddZone(destination);
      await loadCurrentVersion(currentVersion.id);
      toast.success(
        isCrestCard(selectedCard)
          ? `Added ${selectedCard.name} to Crests.`
          : `Added ${quantity} cop${quantity === 1 ? "y" : "ies"} of ${selectedCard.name} to the ${destination} deck zone.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add card to deck",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleQuantityChange(
    entry: DeckCardEntry,
    nextQuantity: number,
  ) {
    if (nextQuantity <= 0) return;

    setSaving(true);
    setError(null);

    try {
      await updateDeckCard(entry.id, {
        quantity: nextQuantity,
      });

      await loadCurrentVersion(entry.deck_version_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update quantity",
      );
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
      toast.success(
        `Updated the printing used for ${entry.card?.name ?? "this card"}.`,
      );
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
      toast.success(`Removed ${entry.card?.name ?? "the card"}.`, {
        title: "Card removed",
        duration: 10000,
        action: {
          label: "Undo",
          onClick: () => undoCardRemoval(entry),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove card");
    } finally {
      setSaving(false);
    }
  }

  async function undoCardRemoval(entry: DeckCardEntry) {
    setSaving(true);
    try {
      await addCardToDeckVersion(entry.deck_version_id, {
        card_id: entry.card_id,
        printing_id: entry.printing_id,
        quantity: entry.quantity,
        zone: entry.zone,
      });
      // Global toasts can outlive this page. Notify whichever builder is now mounted.
      window.dispatchEvent(
        new CustomEvent("cardfight:deck-version-restored", {
          detail: entry.deck_version_id,
        }),
      );
      toast.success(`Restored ${entry.card?.name ?? "the card"}.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore card",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={builderRef}>
      <PageHeader title="Deck Builder" />

      <div className="collection-workspace">
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

        <div className="builder-columns">
          <CardCatalogPanel
            cardSearch={cardSearch}
            cardResults={cardResults}
            selectedCard={selectedCard}
            selectedCardId={selectedCardId}
            newCard={newCard}
            cardFormMode={cardFormMode}
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
            onInspectSelectedCard={() =>
              selectedCard && setInspectedCard({ card: selectedCard })
            }
            onResumeCardEdit={() =>
              editingCardSnapshot &&
              setInspectedCard({ card: editingCardSnapshot })
            }
            onCancelCardEdit={handleCancelCardEdit}
            onSetSaved={handleSetSaved}
            onSetUpdated={handleSetUpdated}
            onSetDeleted={handleSetDeleted}
            composer={
              <DeckCardComposer
                currentVersion={currentVersion}
                selectedCard={selectedCard}
                selectedPrintingId={selectedPrintingId}
                addQuantity={addQuantity}
                addZone={addZone}
                saving={saving}
                onSelectedPrintingIdChange={setSelectedPrintingId}
                onAddQuantityChange={setAddQuantity}
                onAddZoneChange={handleAddZoneChange}
                onAddCardToVersion={handleAddCardToVersion}
              />
            }
          />

          <DeckVersionContents
            currentVersion={currentVersion}
            groupedCards={groupedCards}
            activeZone={addZone}
            onActiveZoneChange={handleAddZoneChange}
            saving={saving}
            onQuantityChange={handleQuantityChange}
            onPrintingChange={handlePrintingChange}
            onRemoveCard={handleRemoveCard}
            onInspectCard={(entry) =>
              entry.card &&
              setInspectedCard({ card: entry.card, printing: entry.printing })
            }
          />
        </div>
        <DeckVersionComparison
          versions={versions}
          currentVersion={currentVersion}
          baselineVersion={comparisonBaseline}
          selectedBaselineId={comparisonBaselineId}
          loading={loadingComparison}
          onSelectedBaselineIdChange={setComparisonBaselineId}
        />
      </div>
      {inspectedCard && (
        <CardInspector
          key={inspectedCard.card.id}
          card={inspectedCard.card}
          printing={inspectedCard.printing}
          editingPrimary={
            cardFormMode === "edit" &&
            editingCardSnapshot?.id === inspectedCard.card.id
          }
          onClose={() => {
            if (!saving) setInspectedCard(null);
          }}
          footer={
            cardFormMode !== "edit" ||
            editingCardSnapshot?.id !== inspectedCard.card.id ? (
              <button
                type="button"
                className="workspace-button"
                onClick={() => startCardEdit(inspectedCard.card)}
              >
                Edit card
              </button>
            ) : undefined
          }
        >
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100"
            >
              {error}
            </p>
          )}
          {cardFormMode === "edit" &&
            editingCardSnapshot?.id === inspectedCard.card.id && (
              <ManualCardForm
                value={newCard}
                mode="edit"
                onChange={setNewCard}
                onSubmit={handleSaveCardForm}
                onCancelEdit={handleCancelCardEdit}
                disabled={saving}
                canSubmit={manualCardIsComplete}
                options={cardFormOptions}
                onSetSaved={handleSetSaved}
              />
            )}
        </CardInspector>
      )}
    </div>
  );
}
