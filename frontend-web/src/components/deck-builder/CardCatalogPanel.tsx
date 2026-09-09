import { Library, Pencil, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import { CardCreationTools } from "../cards/CardCreationTools";
import { DeckBuilderStepHeader } from "./DeckBuilderStepHeader";
import { ManualCardForm } from "./ManualCardForm";
import type { ManualCardFormState } from "./manualCardFormState";
import type {
  Card,
  CardFormOptions,
  CardImageAnalysisResult,
  CardSetOption,
} from "../../types/api";
import { formatCardNation } from "../../utils/cards";

type CardFormMode = "create" | "edit";

type CardCatalogPanelProps = {
  cardSearch: string;
  cardResults: Card[];
  selectedCard: Card | null;
  selectedCardId: string;
  newCard: ManualCardFormState;
  cardFormMode: CardFormMode;
  analysisResult: CardImageAnalysisResult | null;
  analyzingImage: boolean;
  loadingCards: boolean;
  saving: boolean;
  manualCardIsComplete: boolean;
  cardFormOptions: CardFormOptions;
  onCardSearchChange: (value: string) => void;
  onSearch: () => void;
  onClearCardSearch: () => void;
  onSelectedCardIdChange: (value: string) => void;
  onNewCardChange: (value: ManualCardFormState) => void;
  onSaveCardForm: () => void;
  onEditSelectedCard: () => void;
  onCancelCardEdit: () => void;
  onAnalyzeCardImage: (file: File) => void;
  onApplyCardAnalysis: () => void;
  onSetSaved: (cardSet: CardSetOption) => void;
  onSetUpdated: (previousCode: string, cardSet: CardSetOption) => void;
  onSetDeleted: (setCode: string) => void;
};

function getPrimaryPrintingLabel(card: Card) {
  const printing = card.primary_printing;

  if (!printing) return "No printing";

  return [printing.set_code, printing.rarity].filter(Boolean).join(" · ");
}

function cardMeta(card: Card | null) {
  if (!card) return "Unknown card";

  const chunks = [
    card.grade !== null ? `Grade ${card.grade}` : null,
    formatCardNation(card.nation),
    card.card_type,
  ].filter(Boolean);

  return chunks.join(" · ") || "No card metadata";
}

export function CardCatalogPanel({
  cardSearch,
  cardResults,
  selectedCard,
  selectedCardId,
  newCard,
  cardFormMode,
  analysisResult,
  analyzingImage,
  loadingCards,
  saving,
  manualCardIsComplete,
  cardFormOptions,
  onCardSearchChange,
  onSearch,
  onClearCardSearch,
  onSelectedCardIdChange,
  onNewCardChange,
  onSaveCardForm,
  onEditSelectedCard,
  onCancelCardEdit,
  onAnalyzeCardImage,
  onApplyCardAnalysis,
  onSetSaved,
  onSetUpdated,
  onSetDeleted,
}: CardCatalogPanelProps) {
  const hasSearchState = cardSearch.trim().length > 0 || cardResults.length > 0;
  const isEditing = cardFormMode === "edit";

  return (
    <section
      data-anime="motion-panel"
      className="min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
    >
      <DeckBuilderStepHeader
        step={2}
        title="Find or create a card"
        description="Search the shared catalog first, or create a card when it is missing."
        action={
          <Link
            to="/cards"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.09] hover:text-slate-100"
            title="Open the full shared card catalog"
          >
            <Library className="h-4 w-4" />
            <span className="hidden sm:inline">Card Library</span>
          </Link>
        }
      />

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-white/10 p-3">
          <input
            value={cardSearch}
            onChange={(event) => onCardSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearch();
              }
            }}
            placeholder="Search cards..."
            title="Search existing card records by name, skill text, nation, or card type."
            className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
          />

          <button
            type="button"
            onClick={onSearch}
            disabled={loadingCards}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
            title="Search the local card catalog"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            type="button"
            onClick={onClearCardSearch}
            disabled={!hasSearchState}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Clear search text and search results"
            aria-label="Clear card search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                Catalog results
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {cardResults.length
                  ? `${cardResults.length} card${cardResults.length === 1 ? "" : "s"} found`
                  : "Search by name, nation, type, skill, or set"}
              </p>
            </div>

            <button
              type="button"
              onClick={onEditSelectedCard}
              disabled={!selectedCard}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
              title={
                selectedCard
                  ? "Load the selected card into the edit form"
                  : "Search and select a card before editing"
              }
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit selected</span>
            </button>
          </div>

          <div className="mt-3 max-h-64 space-y-2 overflow-auto">
            {cardResults.length ? (
              cardResults.map((card) => (
                <button
                  key={card.id}
                  data-builder-anime="card-result"
                  type="button"
                  onClick={() => onSelectedCardIdChange(String(card.id))}
                  className={[
                    "w-full rounded-xl border p-2.5 text-left transition will-change-transform",
                    selectedCardId === String(card.id)
                      ? "border-cyan-300/40 bg-cyan-300/10"
                      : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}
                  title="Select this card so it can be added to the current deck version"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-50">
                        {card.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {cardMeta(card)}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.68rem] font-bold text-slate-400">
                      {getPrimaryPrintingLabel(card)}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-center text-xs leading-5 text-slate-500">
                Enter at least two characters to search, or use the card creator
                below.
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditing ? (
        <details
          open
          className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-3"
        >
          <summary className="cursor-pointer select-none text-sm font-black text-slate-100">
            Edit selected card
          </summary>

          <ManualCardForm
            value={newCard}
            mode={cardFormMode}
            onChange={onNewCardChange}
            onSubmit={onSaveCardForm}
            onCancelEdit={onCancelCardEdit}
            disabled={saving}
            canSubmit={manualCardIsComplete}
            options={cardFormOptions}
            onSetSaved={onSetSaved}
          />
        </details>
      ) : (
        <CardCreationTools
          value={newCard}
          onChange={onNewCardChange}
          onSubmit={onSaveCardForm}
          saving={saving}
          canSubmit={manualCardIsComplete}
          options={cardFormOptions}
          analysisResult={analysisResult}
          analyzingImage={analyzingImage}
          onAnalyzeImage={onAnalyzeCardImage}
          onApplyAnalysis={onApplyCardAnalysis}
          onSetSaved={onSetSaved}
          onSetUpdated={onSetUpdated}
          onSetDeleted={onSetDeleted}
        />
      )}
    </section>
  );
}
