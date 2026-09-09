import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Layers3,
  Pencil,
  RefreshCcw,
  Search,
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
import { WorkspaceSectionHeader } from "../components/layout/WorkspaceSectionHeader";
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
    <div className="min-w-0">
      <PageHeader
        eyebrow="Card Library"
        title="Build and browse your card catalog"
        description="Create cards manually or from an image, then search, inspect, and correct the shared records used throughout the app."
      />

      <details
        data-anime="motion-panel"
        className="workspace-panel group mb-4"
      >
        <summary className="cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
          <WorkspaceSectionHeader
            eyebrow="Create"
            title="Add cards to the library"
            description="Image reader or manual entry · Available throughout your lab."
            actions={
              <span className="workspace-button inline-flex w-10 items-center justify-center border border-white/10 bg-white/[0.04] text-cyan-100">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </span>
            }
          />
        </summary>

        <div className="mt-4 border-t border-white/10 pt-1">
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
        </div>
      </details>

      <section
        data-anime="motion-panel"
        className="workspace-panel min-w-0"
      >
        <WorkspaceSectionHeader
          eyebrow="Catalog"
          title="Card records"
          description={`Showing ${cards.length} of ${totalItems} cards${activeFilterCount ? ` · ${activeFilterCount} active filters` : ""}`}
          actions={
          <button
            type="button"
            onClick={loadCards}
            disabled={loading}
            className="workspace-button inline-flex items-center gap-2 border border-white/10 bg-white/[0.05] px-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh card records"
            aria-label="Refresh card records"
          >
            <RefreshCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          }
        />

        <div className="workspace-inset mt-4 p-3 sm:p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
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
            className="workspace-control col-span-3 min-w-0 placeholder:text-slate-600 sm:col-span-1"
          />

          <button
            type="button"
            onClick={loadCards}
            disabled={loading}
            className="workspace-button col-span-2 inline-flex items-center justify-center gap-2 border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1"
            title="Apply filters"
          >
            <Search className="h-4 w-4" />
            Search
          </button>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!activeFilterCount}
            className="workspace-button inline-flex items-center justify-center border border-white/10 bg-white/[0.035] px-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            title="Clear all filters"
          >
            Clear
          </button>
          </div>

          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1fr)]">
          <select
            value={setCode}
            onChange={(event) => setSetCode(event.target.value)}
            title="Filter by card set"
            className="workspace-control w-full min-w-0"
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
            className="workspace-control w-full min-w-0"
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
            className="workspace-control w-full min-w-0"
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
            className="workspace-control w-full min-w-0"
          >
            {CARD_TYPE_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All types"}
              </option>
            ))}
          </select>

          </div>
        </div>

        {addingPrintingCard ? (
          <div className="mt-4 rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] p-3 sm:p-4">
            <WorkspaceSectionHeader
              eyebrow="New printing"
              title={addingPrintingCard.name}
              description="A separate set, number, or rarity with its own deck usage and pricing."
              className="mb-3"
            />

            {addingPrintingCard.printings.length ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {addingPrintingCard.printings.map((printing) => (
                  <span
                    key={printing.id}
                    className="max-w-full break-words rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[0.65rem] font-bold text-slate-400"
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
          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 sm:p-4">
            <WorkspaceSectionHeader
              eyebrow="Edit card"
              title={editingCard.name}
              description="Changes update the shared card record everywhere it is used."
            />
            <p className="mb-3 mt-2 break-words text-xs text-slate-500">
              {primaryPrintingLabel(editingCard)}
            </p>

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
          className="workspace-inset mt-4 h-[min(42rem,72dvh)] min-h-80 overflow-auto p-1.5"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">
              Loading cards...
            </div>
          ) : cards.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="text-base font-black text-slate-300">
                  No cards found.
                </p>
                <p className="mt-1 text-xs text-slate-500">
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
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.045]">
                      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="shrink-0 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[0.65rem] font-black text-cyan-100">
                              {card.grade !== null ? `G${card.grade}` : "G?"}
                            </span>

                            <h4 className="min-w-0 break-words text-sm font-black leading-6 text-slate-50">
                              {card.name}
                            </h4>
                          </div>

                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {cardMeta(card)} · {printingCount(card)} printing
                            {printingCount(card) === 1 ? "" : "s"}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {card.printings.length ? (
                              card.printings.map((printing) => (
                                <span
                                  key={printing.id}
                                  className="max-w-full break-words rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[0.65rem] font-bold text-slate-500"
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

                        <div className="flex flex-wrap items-start gap-2 border-t border-white/5 pt-2 lg:border-0 lg:pt-0">
                          <button
                            type="button"
                            onClick={() => startAddingPrinting(card)}
                            disabled={savingPrinting}
                            className="workspace-button inline-flex items-center gap-2 border border-violet-300/20 bg-violet-300/10 px-3 text-xs font-bold text-violet-100 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Add a different set, collector number, or rarity for this card"
                          >
                            <Layers3 className="h-3.5 w-3.5" />
                            Add printing
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditingCard(card)}
                            disabled={savingEdit}
                            className="workspace-button inline-flex items-center gap-2 border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Edit this card record"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </div>
                      </div>

                      {card.skill_text ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
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
