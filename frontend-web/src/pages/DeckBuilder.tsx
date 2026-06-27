import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDeckBuilderMotion } from "../animations/useDeckBuilderMotion";
import {
  addCardPrinting,
  analyzeCardImage,
  createCard,
  getCard,
  searchCards,
  updateCard,
  updateCardPrinting,
} from "../api/cards";
import {
  addCardToDeckVersion,
  createDeckVersion,
  getDeckVersion,
  getDeckVersions,
  removeDeckCard,
  updateDeckCard,
} from "../api/deckBuilder";
import { getDecks } from "../api/decks";
import { CardCatalogPanel } from "../components/deck-builder/CardCatalogPanel";
import { DeckBuilderSetup } from "../components/deck-builder/DeckBuilderSetup";
import { DeckVersionContents } from "../components/deck-builder/DeckVersionContents";
import { EMPTY_MANUAL_CARD_FORM } from "../components/deck-builder/manualCardFormState";
import { PageHeader } from "../components/layout/PageHeader";
import type {
  Card,
  CardImageAnalysisResult,
  CreateCardPayload,
  Deck,
  DeckCardEntry,
  DeckCardZone,
  DeckVersion,
  DeckVersionSummary,
} from "../types/api";

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

  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");

  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionNotes, setNewVersionNotes] = useState("");

  const [cardSearch, setCardSearch] = useState("");
  const [cardResults, setCardResults] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [cardFormMode, setCardFormMode] = useState<CardFormMode>("create");
  const [cardAnalysis, setCardAnalysis] =
    useState<CardImageAnalysisResult | null>(null);
  const [analyzingCardImage, setAnalyzingCardImage] = useState(false);

  const [addQuantity, setAddQuantity] = useState(4);
  const [addZone, setAddZone] = useState<DeckCardZone>("main");

  const [newCard, setNewCard] = useState(EMPTY_MANUAL_CARD_FORM);

  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === Number(selectedDeckId)) ?? null,
    [decks, selectedDeckId],
  );

  const selectedCard = useMemo(
    () => cardResults.find((card) => card.id === Number(selectedCardId)) ?? null,
    [cardResults, selectedCardId],
  );

  const manualCardIsComplete = useMemo(() => {
    return Object.values(newCard).every((value) => value.trim().length > 0);
  }, [newCard]);

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
  }, []);

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
  }, []);

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
    if (!selectedDeckId) {
      setVersions([]);
      setCurrentVersion(null);
      setSelectedVersionId("");
      return;
    }

    void loadDeckVersions(Number(selectedDeckId));
  }, [selectedDeckId, loadDeckVersions]);

  useEffect(() => {
    if (!selectedVersionId) {
      setCurrentVersion(null);
      return;
    }

    void loadCurrentVersion(Number(selectedVersionId));
  }, [selectedVersionId, loadCurrentVersion]);

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
      nation: selectedCard.nation ?? "",
      card_type: selectedCard.card_type,
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
    setNewCard({
      name: result.fields.name,
      grade: result.fields.grade,
      nation: result.fields.nation,
      card_type: result.fields.card_type || "Normal Unit",
      set_code: result.fields.set_code,
      set_name: result.fields.set_name,
      card_number: result.fields.card_number,
      rarity: result.fields.rarity,
    });

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
    if (!selectedDeck) return;

    setSaving(true);
    setError(null);

    try {
      const version = await createDeckVersion(selectedDeck.id, {
        version_name: newVersionName || undefined,
        notes: newVersionNotes,
        is_active: true,
      });

      setNewVersionName("");
      setNewVersionNotes("");
      setCurrentVersion(version);
      setSelectedVersionId(String(version.id));
      await loadDeckVersions(selectedDeck.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deck version");
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
        nation: newCard.nation,
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

        setNewCard(EMPTY_MANUAL_CARD_FORM);
        setCardFormMode("create");
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
      setNewCard(EMPTY_MANUAL_CARD_FORM);
      setCardFormMode("create");
      setCardAnalysis(null);
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
        printing_id: selectedCard.primary_printing?.id ?? null,
        quantity: addQuantity,
        zone: addZone,
      });

      await loadCurrentVersion(currentVersion.id);
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

  async function handleRemoveCard(entry: DeckCardEntry) {
    setSaving(true);
    setError(null);

    try {
      await removeDeckCard(entry.id);
      await loadCurrentVersion(entry.deck_version_id);
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

      {error ? (
        <div
          data-anime="motion-panel"
          className="mb-6 rounded-3xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        <DeckBuilderSetup
          decks={decks}
          versions={versions}
          currentVersion={currentVersion}
          selectedDeck={selectedDeck}
          selectedDeckId={selectedDeckId}
          selectedVersionId={selectedVersionId}
          newVersionName={newVersionName}
          newVersionNotes={newVersionNotes}
          loadingDecks={loadingDecks}
          loadingVersions={loadingVersions}
          saving={saving}
          onSelectedDeckIdChange={setSelectedDeckId}
          onSelectedVersionIdChange={setSelectedVersionId}
          onNewVersionNameChange={setNewVersionName}
          onNewVersionNotesChange={setNewVersionNotes}
          onRefreshDecks={loadDecks}
          onRefreshVersions={() =>
            selectedDeck ? void loadDeckVersions(selectedDeck.id) : undefined
          }
          onCreateVersion={handleCreateVersion}
        />

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
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
          />

          <DeckVersionContents
            currentVersion={currentVersion}
            groupedCards={groupedCards}
            cardResults={cardResults}
            selectedCardId={selectedCardId}
            addQuantity={addQuantity}
            addZone={addZone}
            saving={saving}
            selectedCard={selectedCard}
            onSelectedCardIdChange={setSelectedCardId}
            onAddQuantityChange={setAddQuantity}
            onAddZoneChange={setAddZone}
            onAddCardToVersion={handleAddCardToVersion}
            onQuantityChange={handleQuantityChange}
            onRemoveCard={handleRemoveCard}
          />
        </div>
      </div>
    </div>
  );
}