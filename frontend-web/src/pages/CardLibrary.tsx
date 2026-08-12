import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Layers3,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  addCardPrinting,
  analyzeCardImage,
  createCard,
  getCardFormOptions,
  getCardLibraryPage,
  updateCard,
  updateCardPrinting,
} from "../api/cards";
import { CardCreationTools } from "../components/cards/CardCreationTools";
import { CardPrintingForm } from "../components/cards/CardPrintingForm";
import {
  clearCardSetSelection,
  replaceCardSetSelection,
} from "../components/cards/cardSetSelectionState";
import {
  EMPTY_CARD_PRINTING_FORM,
  type CardPrintingFormState,
} from "../components/cards/cardPrintingFormState";
import { ManualCardForm } from "../components/deck-builder/ManualCardForm";
import {
  EMPTY_MANUAL_CARD_FORM,
  DEFAULT_CARD_FORM_OPTIONS,
  cardAnalysisToManualForm,
  manualCardFormIsComplete,
  type ManualCardFormState,
  withSavedCardSet,
} from "../components/deck-builder/manualCardFormState";
import { useToast } from "../components/feedback/useToast";
import { PageHeader } from "../components/layout/PageHeader";
import type {
  Card,
  CardFormOptions,
  CardImageAnalysisResult,
  CardPrinting,
  CardSetOption,
} from "../types/api";
import {
  cardNationToApiValue,
  cardNationToFormValue,
  formatCardNation,
  NATIONLESS_CARD_OPTION,
} from "../utils/cards";

const NATION_OPTIONS = [
  "",
  "Dragon Empire",
  "Dark States",
  "Brandt Gate",
  "Keter Sanctuary",
  "Stoicheia",
  "Lyrical Monasterio",
  NATIONLESS_CARD_OPTION,
];

const CARD_TYPE_OPTIONS = [
  "",
  "Normal Unit",
  "Trigger Unit",
  "G Unit",
  "Normal Order",
  "Blitz Order",
  "Set Order",
];

function primaryPrintingLabel(card: Card) {
  const printing = card.primary_printing;

  if (!printing) return "No primary printing";

  return [printing.set_code, printing.card_number, printing.rarity]
    .filter(Boolean)
    .join(" · ");
}

function printingLabel(printing: CardPrinting) {
  return [printing.set_code, printing.card_number, printing.rarity]
    .filter(Boolean)
    .join(" · ");
}

function cardMeta(card: Card) {
  const chunks = [
    card.grade !== null ? `Grade ${card.grade}` : null,
    formatCardNation(card.nation),
    card.card_type,
  ].filter(Boolean);

  return chunks.join(" · ") || "No card metadata";
}

function printingCount(card: Card) {
  return card.printings?.length ?? 0;
}

function cardToManualForm(card: Card): ManualCardFormState {
  const printing = card.primary_printing;

  return {
    name: card.name,
    grade: card.grade !== null ? String(card.grade) : "",
    nation: cardNationToFormValue(card.nation),
    card_type: card.card_type,
    set_selection: printing?.set_code ?? "",
    set_code: printing?.set_code ?? "",
    set_name: printing?.set_name ?? "",
    card_number: printing?.card_number ?? "",
    rarity: printing?.rarity ?? "",
  };
}

export function CardLibrary() {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const loadRequestRef = useRef(0);

  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [nation, setNation] = useState("");
  const [grade, setGrade] = useState("");
  const [cardType, setCardType] = useState("");
  const [setCode, setSetCode] = useState("");

  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [addingPrintingCard, setAddingPrintingCard] = useState<Card | null>(
    null,
  );
  const [editForm, setEditForm] = useState<ManualCardFormState>(
    EMPTY_MANUAL_CARD_FORM,
  );
  const [printingForm, setPrintingForm] = useState<CardPrintingFormState>(
    EMPTY_CARD_PRINTING_FORM,
  );
  const [createForm, setCreateForm] = useState<ManualCardFormState>(
    EMPTY_MANUAL_CARD_FORM,
  );
  const [cardAnalysis, setCardAnalysis] =
    useState<CardImageAnalysisResult | null>(null);
  const [cardFormOptions, setCardFormOptions] = useState<CardFormOptions>(
    DEFAULT_CARD_FORM_OPTIONS,
  );

  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingPrinting, setSavingPrinting] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

  // TanStack Virtual intentionally returns function refs that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 124,
    overscan: 8,
    getItemKey: (index) => cards[index]?.id ?? index,
  });

  const activeFilterCount = useMemo(() => {
    return [query.trim(), setCode, nation, grade, cardType].filter(Boolean)
      .length;
  }, [query, setCode, nation, grade, cardType]);

  const editFormIsComplete = useMemo(() => {
    return manualCardFormIsComplete(editForm);
  }, [editForm]);

  const createFormIsComplete = useMemo(() => {
    return manualCardFormIsComplete(createForm);
  }, [createForm]);

  useEffect(() => {
    getCardFormOptions()
      .then(setCardFormOptions)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load card form options",
        );
      });
  }, []);

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
    setCreateForm((current) =>
      replaceCardSetSelection(current, previousCode, cardSet),
    );
    setEditForm((current) =>
      replaceCardSetSelection(current, previousCode, cardSet),
    );
    setPrintingForm((current) =>
      replaceCardSetSelection(current, previousCode, cardSet),
    );
    setSetCode((current) =>
      current === previousCode ? cardSet.code : current,
    );
  }

  function handleSetDeleted(setCode: string) {
    setCardFormOptions((current) => ({
      ...current,
      sets: current.sets.filter((option) => option.code !== setCode),
    }));
    setCreateForm((current) => clearCardSetSelection(current, setCode));
    setEditForm((current) => clearCardSetSelection(current, setCode));
    setPrintingForm((current) => clearCardSetSelection(current, setCode));
    setSetCode((current) => (current === setCode ? "" : current));
  }

  function rememberFormSet(
    setCode: string | null | undefined,
    setName: string | null | undefined,
  ) {
    const code = setCode?.trim().toUpperCase() ?? "";
    const name = setName?.trim() ?? "";
    if (code && name) handleSetSaved({ code, name });
  }

  const loadCards = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await getCardLibraryPage({
        q: query.trim() || undefined,
        nation: nation || undefined,
        grade: grade || undefined,
        card_type: cardType || undefined,
        set_code: setCode || undefined,
        page: 1,
        page_size: 500,
      });

      if (requestId === loadRequestRef.current) {
        setCards(response.items);
        setTotalItems(response.pagination.total_items);
      }
    } catch (err) {
      if (requestId === loadRequestRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load cards");
      }
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [query, nation, grade, cardType, setCode]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  function applyCardAnalysis(result: CardImageAnalysisResult) {
    setCreateForm(cardAnalysisToManualForm(result));
    setError(null);
  }

  async function handleAnalyzeCardImage(file: File) {
    setAnalyzingImage(true);
    setCardAnalysis(null);
    setError(null);

    try {
      const result = await analyzeCardImage(file);
      setCardAnalysis(result);
      applyCardAnalysis(result);
      toast.success("Card image analyzed. Review the suggested fields before creating it.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to analyze card image",
      );
    } finally {
      setAnalyzingImage(false);
    }
  }

  function handleApplyCardAnalysis() {
    if (!cardAnalysis) return;
    applyCardAnalysis(cardAnalysis);
  }

  async function createCatalogCard() {
    if (!createFormIsComplete) {
      setError("All card fields are required before creating this card.");
      return;
    }

    setSavingCreate(true);
    setError(null);

    try {
      const created = await createCard({
        name: createForm.name,
        grade: createForm.grade,
        nation: cardNationToApiValue(createForm.nation),
        card_type: createForm.card_type,
        set_code: createForm.set_code,
        set_name: createForm.set_name,
        card_number: createForm.card_number,
        rarity: createForm.rarity,
      });

      rememberFormSet(
        created.primary_printing?.set_code,
        created.primary_printing?.set_name,
      );
      setCreateForm(EMPTY_MANUAL_CARD_FORM);
      setCardAnalysis(null);
      await loadCards();
      toast.success(`${created.name} was added to the shared card catalog.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create card");
    } finally {
      setSavingCreate(false);
    }
  }

  function clearFilters() {
    setQuery("");
    setNation("");
    setGrade("");
    setCardType("");
    setSetCode("");
  }

  function startEditingCard(card: Card) {
    setAddingPrintingCard(null);
    setPrintingForm(EMPTY_CARD_PRINTING_FORM);
    setEditingCard(card);
    setEditForm(cardToManualForm(card));
    setError(null);
  }

  function cancelEditingCard() {
    setEditingCard(null);
    setEditForm(EMPTY_MANUAL_CARD_FORM);
    setError(null);
  }

  function startAddingPrinting(card: Card) {
    setEditingCard(null);
    setEditForm(EMPTY_MANUAL_CARD_FORM);
    setAddingPrintingCard(card);
    setPrintingForm(EMPTY_CARD_PRINTING_FORM);
    setError(null);
  }

  function cancelAddingPrinting() {
    setAddingPrintingCard(null);
    setPrintingForm(EMPTY_CARD_PRINTING_FORM);
    setError(null);
  }

  async function saveNewPrinting() {
    if (!addingPrintingCard) return;

    setSavingPrinting(true);
    setError(null);

    try {
      const printing = await addCardPrinting(addingPrintingCard.id, {
        set_code: printingForm.set_code,
        set_name: printingForm.set_name,
        card_number: printingForm.card_number,
        rarity: printingForm.rarity,
      });

      rememberFormSet(printing.set_code, printing.set_name);
      await loadCards();
      cancelAddingPrinting();
      toast.success(
        `Added ${printing.rarity ?? "another"} printing to ${addingPrintingCard.name}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add card printing",
      );
    } finally {
      setSavingPrinting(false);
    }
  }

  async function saveEditingCard() {
    if (!editingCard) return;

    if (!editFormIsComplete) {
      setError("All edit fields are required before saving this card.");
      return;
    }

    setSavingEdit(true);
    setError(null);

    try {
      await updateCard(editingCard.id, {
        name: editForm.name,
        grade: editForm.grade,
        nation: cardNationToApiValue(editForm.nation),
        card_type: editForm.card_type,
      });

      const savedPrinting = editingCard.primary_printing
        ? await updateCardPrinting(editingCard.primary_printing.id, {
            set_code: editForm.set_code,
            set_name: editForm.set_name,
            card_number: editForm.card_number,
            rarity: editForm.rarity,
          })
        : await addCardPrinting(editingCard.id, {
            set_code: editForm.set_code,
            set_name: editForm.set_name,
            card_number: editForm.card_number,
            rarity: editForm.rarity,
          });

      rememberFormSet(savedPrinting.set_code, savedPrinting.set_name);
      await loadCards();
      cancelEditingCard();
      toast.success(`Saved changes to ${editForm.name.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Card Library"
        title="Build and browse your card catalog"
        description="Create cards manually or from an image, then search, inspect, and correct the shared records used throughout the app."
      />

      <section
        data-anime="motion-panel"
        className="mb-6 rounded-[2rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              <Sparkles className="h-4 w-4" />
              Catalog tools
            </div>
            <h3 className="mt-2 text-2xl font-black text-slate-50">
              Add cards to the library
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Use the image reader for a fast first pass or enter a card
              manually. Either method creates the same shared catalog record
              available to Deck Builder and Order Tracker.
            </p>
          </div>
        </div>

        <details className="mt-5 rounded-3xl border border-cyan-300/20 bg-black/20 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-1 py-1 select-none">
            <span className="inline-flex items-center gap-3 text-sm font-black text-cyan-100">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
                <Plus className="h-4 w-4" />
              </span>
              Open card creator
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Image reader + manual entry
            </span>
          </summary>

          <CardCreationTools
            value={createForm}
            analysisResult={cardAnalysis}
            analyzingImage={analyzingImage}
            saving={savingCreate}
            canSubmit={createFormIsComplete}
            options={cardFormOptions}
            onChange={setCreateForm}
            onSubmit={createCatalogCard}
            onAnalyzeImage={handleAnalyzeCardImage}
            onApplyAnalysis={handleApplyCardAnalysis}
            onSetSaved={handleSetSaved}
            onSetUpdated={handleSetUpdated}
            onSetDeleted={handleSetDeleted}
          />
        </details>
      </section>

      <section
        data-anime="motion-panel"
        className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Catalog
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-50">
              Card records
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Showing {cards.length} of {totalItems} cards
              {activeFilterCount ? ` · ${activeFilterCount} active filters` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={loadCards}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh cards from the backend"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-12">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadCards();
              }
            }}
            placeholder="Search name, set, number, rarity, skill..."
            title="Search card records"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50 lg:col-span-2 xl:col-span-5"
          />

          <select
            value={setCode}
            onChange={(event) => setSetCode(event.target.value)}
            title="Filter by card set"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50 xl:col-span-4"
          >
            <option value="">All card sets</option>
            {cardFormOptions.sets.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.name}
              </option>
            ))}
          </select>

          <select
            value={nation}
            onChange={(event) => setNation(event.target.value)}
            title="Filter by nation"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50 xl:col-span-4 xl:row-start-2"
          >
            {NATION_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All nations"}
              </option>
            ))}
          </select>

          <select
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            title="Filter by grade"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50 xl:col-span-3 xl:row-start-2"
          >
            <option value="">All grades</option>
            <option value="0">Grade 0</option>
            <option value="1">Grade 1</option>
            <option value="2">Grade 2</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
          </select>

          <select
            value={cardType}
            onChange={(event) => setCardType(event.target.value)}
            title="Filter by card type"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50 xl:col-span-5 xl:row-start-2"
          >
            {CARD_TYPE_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All types"}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadCards}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50 xl:col-span-2 xl:col-start-10 xl:row-start-1"
            title="Apply filters"
          >
            <Search className="h-4 w-4" />
            Search
          </button>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!activeFilterCount}
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 xl:col-span-1 xl:col-start-12 xl:row-start-1"
            title="Clear all filters"
          >
            Clear
          </button>
        </div>

        {addingPrintingCard ? (
          <div className="mt-5 rounded-3xl border border-violet-300/20 bg-violet-300/[0.06] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200/80">
                  New printing
                </p>
                <h4 className="mt-1 text-lg font-black text-slate-50">
                  Add another printing of {addingPrintingCard.name}
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  The card identity stays shared while its set, collector
                  number, rarity, deck usage, and pricing remain distinct.
                </p>
              </div>

              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-400">
                {addingPrintingCard.printings.length} existing printing
                {addingPrintingCard.printings.length === 1 ? "" : "s"}
              </span>
            </div>

            {addingPrintingCard.printings.length ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {addingPrintingCard.printings.map((printing) => (
                  <span
                    key={printing.id}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-400"
                  >
                    {printingLabel(printing) || `Printing ${printing.id}`}
                  </span>
                ))}
              </div>
            ) : null}

            <CardPrintingForm
              value={printingForm}
              options={cardFormOptions}
              disabled={savingPrinting}
              onChange={setPrintingForm}
              onSubmit={saveNewPrinting}
              onCancel={cancelAddingPrinting}
              onSetSaved={handleSetSaved}
            />
          </div>
        ) : null}

        {editingCard ? (
          <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/80">
                  Editing catalog card
                </p>
                <h4 className="mt-1 text-lg font-black text-slate-50">
                  {editingCard.name}
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  Changes here update the shared card record anywhere this card
                  is used.
                </p>
              </div>

              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-400">
                {primaryPrintingLabel(editingCard)}
              </span>
            </div>

            <ManualCardForm
              value={editForm}
              mode="edit"
              onChange={setEditForm}
              onSubmit={saveEditingCard}
              onCancelEdit={cancelEditingCard}
              disabled={savingEdit}
              canSubmit={editFormIsComplete}
              options={cardFormOptions}
              onSetSaved={handleSetSaved}
            />
          </div>
        ) : null}

        <div
          ref={parentRef}
          className="mt-5 h-[42rem] overflow-auto rounded-3xl border border-white/10 bg-black/20 p-2"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">
              Loading cards...
            </div>
          ) : cards.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="text-lg font-black text-slate-300">
                  No cards found.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Try changing your filters or add a card with the creator above.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const card = cards[virtualRow.index];

                return (
                  <article
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full px-1 py-1"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:bg-white/[0.045]">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-black text-cyan-100">
                              {card.grade !== null ? `G${card.grade}` : "G?"}
                            </span>

                            <h4 className="min-w-0 truncate text-lg font-black text-slate-50">
                              {card.name}
                            </h4>
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {cardMeta(card)}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {card.printings.length ? (
                              card.printings.map((printing) => (
                                <span
                                  key={printing.id}
                                  className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[0.7rem] font-bold text-slate-500"
                                >
                                  {printingLabel(printing) ||
                                    `Printing ${printing.id}`}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-600">
                                No printings recorded
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 text-right">
                          <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">
                            {printingCount(card)} printing
                            {printingCount(card) === 1 ? "" : "s"}
                          </span>

                          <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">
                            {formatCardNation(card.nation)}
                          </span>

                          <button
                            type="button"
                            onClick={() => startAddingPrinting(card)}
                            disabled={savingPrinting}
                            className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-bold text-violet-100 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Add a different set, collector number, or rarity for this card"
                          >
                            <Layers3 className="h-3.5 w-3.5" />
                            Add printing
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditingCard(card)}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Edit this card record"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </div>
                      </div>

                      {card.skill_text ? (
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
                          {card.skill_text}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
