import { Pencil, Search, X } from "lucide-react";

import { CardImageImportAssistant } from "./CardImageImportAssistant";
import { ManualCardForm } from "./ManualCardForm";
import type { ManualCardFormState } from "./manualCardFormState";
import type { Card, CardImageAnalysisResult } from "../../types/api";

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
    card.nation,
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
}: CardCatalogPanelProps) {
  const hasSearchState = cardSearch.trim().length > 0 || cardResults.length > 0;
  const isEditing = cardFormMode === "edit";

  return (
    <section
      data-anime="motion-panel"
      className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            Step 2
          </p>
          <h3 className="mt-2 text-2xl font-black text-slate-50">
            Find or create a card
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Search the local catalog first. If the card does not exist yet,
            create a manual entry below.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <input
          value={cardSearch}
          onChange={(event) => onCardSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSearch();
            }
          }}
          placeholder="Search at least 2 characters..."
          title="Search existing card records by name, skill text, nation, or card type."
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
        />

        <button
          type="button"
          onClick={onSearch}
          disabled={loadingCards}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
          title="Search the local card catalog"
        >
          <Search className="h-4 w-4" />
          Search
        </button>

        <button
          type="button"
          onClick={onClearCardSearch}
          disabled={!hasSearchState}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          title="Clear search text and search results"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>

      <div className="mt-5 max-h-72 space-y-2 overflow-auto rounded-3xl border border-white/10 bg-black/20 p-3">
        {cardResults.length ? (
          cardResults.map((card) => (
            <button
              key={card.id}
              data-builder-anime="card-result"
              type="button"
              onClick={() => onSelectedCardIdChange(String(card.id))}
              className={[
                "w-full rounded-2xl border p-3 text-left transition will-change-transform",
                selectedCardId === String(card.id)
                  ? "border-cyan-300/40 bg-cyan-300/10"
                  : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]",
              ].join(" ")}
              title="Select this card so it can be added to the current deck version"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-50">
                    {card.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {cardMeta(card)}
                  </p>
                </div>

                <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">
                  {getPrimaryPrintingLabel(card)}
                </span>
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-slate-500">
            Enter at least 2 characters to search, or create a manual card below.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onEditSelectedCard}
        disabled={!selectedCard}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
        title={
          selectedCard
            ? "Load the selected card into the edit form"
            : "Search and select a card before editing"
        }
      >
        <Pencil className="h-4 w-4" />
        Edit selected card
      </button>

      <CardImageImportAssistant
        analysisResult={analysisResult}
        analyzing={analyzingImage}
        onAnalyzeImage={onAnalyzeCardImage}
        onApplyAnalysis={onApplyCardAnalysis}
      />

      <details
        open={isEditing || Boolean(analysisResult)}
        className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4"
      >
        <summary className="cursor-pointer select-none text-sm font-black text-slate-100">
          {isEditing ? "Edit selected card" : "Create manual card"}
        </summary>

        <ManualCardForm
          value={newCard}
          mode={cardFormMode}
          onChange={onNewCardChange}
          onSubmit={onSaveCardForm}
          onCancelEdit={onCancelCardEdit}
          disabled={saving}
          canSubmit={manualCardIsComplete}
        />
      </details>
    </section>
  );
}