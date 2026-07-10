import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, RefreshCcw, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  addCardPrinting,
  getCardFormOptions,
  getCardLibraryPage,
  updateCard,
  updateCardPrinting,
} from "../api/cards";
import { ManualCardForm } from "../components/deck-builder/ManualCardForm";
import {
  EMPTY_MANUAL_CARD_FORM,
  DEFAULT_CARD_FORM_OPTIONS,
  manualCardFormIsComplete,
  type ManualCardFormState,
} from "../components/deck-builder/manualCardFormState";
import { PageHeader } from "../components/layout/PageHeader";
import type { Card, CardFormOptions } from "../types/api";

const NATION_OPTIONS = [
  "",
  "Dragon Empire",
  "Dark States",
  "Brandt Gate",
  "Keter Sanctuary",
  "Stoicheia",
];

const CARD_TYPE_OPTIONS = [
  "",
  "Normal Unit",
  "Trigger Unit",
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

function cardMeta(card: Card) {
  const chunks = [
    card.grade !== null ? `Grade ${card.grade}` : null,
    card.nation,
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
    nation: card.nation ?? "",
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

  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [nation, setNation] = useState("");
  const [grade, setGrade] = useState("");
  const [cardType, setCardType] = useState("");

  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editForm, setEditForm] = useState<ManualCardFormState>(
    EMPTY_MANUAL_CARD_FORM,
  );
  const [cardFormOptions, setCardFormOptions] = useState<CardFormOptions>(
    DEFAULT_CARD_FORM_OPTIONS,
  );

  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return [query.trim(), nation, grade, cardType].filter(Boolean).length;
  }, [query, nation, grade, cardType]);

  const editFormIsComplete = useMemo(() => {
    return manualCardFormIsComplete(editForm);
  }, [editForm]);

  useEffect(() => {
    getCardFormOptions()
      .then(setCardFormOptions)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load card form options",
        );
      });
  }, []);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getCardLibraryPage({
        q: query.trim() || undefined,
        nation: nation || undefined,
        grade: grade || undefined,
        card_type: cardType || undefined,
        page: 1,
        page_size: 500,
      });

      setCards(response.items);
      setTotalItems(response.pagination.total_items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [query, nation, grade, cardType]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  function clearFilters() {
    setQuery("");
    setNation("");
    setGrade("");
    setCardType("");
  }

  function startEditingCard(card: Card) {
    setEditingCard(card);
    setEditForm(cardToManualForm(card));
    setError(null);
  }

  function cancelEditingCard() {
    setEditingCard(null);
    setEditForm(EMPTY_MANUAL_CARD_FORM);
    setError(null);
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
        nation: editForm.nation,
        card_type: editForm.card_type,
      });

      if (editingCard.primary_printing) {
        await updateCardPrinting(editingCard.primary_printing.id, {
          set_code: editForm.set_code,
          set_name: editForm.set_name,
          card_number: editForm.card_number,
          rarity: editForm.rarity,
        });
      } else {
        await addCardPrinting(editingCard.id, {
          set_code: editForm.set_code,
          set_name: editForm.set_name,
          card_number: editForm.card_number,
          rarity: editForm.rarity,
        });
      }

      await loadCards();
      cancelEditingCard();
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
        title="Browse your card catalog"
        description="Search, filter, inspect, and correct the shared card records used by your deck versions."
      />

      {error ? (
        <div
          data-anime="motion-panel"
          className="mb-6 rounded-3xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100"
        >
          {error}
        </div>
      ) : null}

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

        <div className="mt-5 grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.5fr_0.8fr_auto_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadCards();
              }
            }}
            placeholder="Search card name, skill text, nation..."
            title="Search card records"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
          />

          <select
            value={nation}
            onChange={(event) => setNation(event.target.value)}
            title="Filter by nation"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
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
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
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
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/50"
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
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            title="Apply filters"
          >
            <Search className="h-4 w-4" />
            Search
          </button>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!activeFilterCount}
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            title="Clear all filters"
          >
            Clear
          </button>
        </div>

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
                  Try changing your filters or importing cards from Deck Builder.
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

                          <p className="mt-1 text-xs text-slate-600">
                            {primaryPrintingLabel(card)}
                          </p>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 text-right">
                          <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">
                            {printingCount(card)} printing
                            {printingCount(card) === 1 ? "" : "s"}
                          </span>

                          {card.nation ? (
                            <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">
                              {card.nation}
                            </span>
                          ) : null}

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
