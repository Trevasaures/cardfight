import { type ReactNode } from "react";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useRememberedScroll } from "../../hooks/useRememberedScroll";
import { writeScrollPosition } from "../../utils/viewState";
import { Check, Eye, Library, Pencil, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { CardArtwork } from "../cards/CardArtwork";
import { CardSetManager } from "../cards/CardSetManager";
import { ManualCardForm } from "./ManualCardForm";
import type { ManualCardFormState } from "./manualCardFormState";
import type { Card, CardFormOptions, CardSetOption } from "../../types/api";
import {
  cardGradeBadge,
  formatCardNation,
  isCrestCard,
} from "../../utils/cards";

type CardFormMode = "create" | "edit";

type CardCatalogPanelProps = {
  composer: ReactNode;
  cardSearch: string;
  cardResults: Card[];
  selectedCard: Card | null;
  selectedCardId: string;
  newCard: ManualCardFormState;
  cardFormMode: CardFormMode;
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
  onInspectSelectedCard: () => void;
  onResumeCardEdit: () => void;
  onCancelCardEdit: () => void;
  onSetSaved: (cardSet: CardSetOption) => void;
  onSetUpdated: (previousCode: string, cardSet: CardSetOption) => void;
  onSetDeleted: (setCode: string) => void;
};

export function CardCatalogPanel({
  composer,
  cardSearch,
  cardResults,
  selectedCard,
  selectedCardId,
  newCard,
  cardFormMode,
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
  onInspectSelectedCard,
  onResumeCardEdit,
  onCancelCardEdit,
  onSetSaved,
  onSetUpdated,
  onSetDeleted,
}: CardCatalogPanelProps) {
  const [grade, setGrade] = usePersistentState<string>(
    "cardfight.deck-builder.catalog-grade",
    "all",
  );
  const scrollKey = "cardfight.scroll.builder-catalog";
  const catalogRef = useRememberedScroll<HTMLDivElement>(
    scrollKey,
    !loadingCards && cardResults.length > 0,
  );
  function resetCatalogScroll() {
    if (catalogRef.current) catalogRef.current.scrollTop = 0;
    writeScrollPosition(scrollKey, 0);
  }
  const isEditing = cardFormMode === "edit";
  const visibleCards = cardResults.filter(
    (card) =>
      grade === "all" ||
      (grade === "crest" ? isCrestCard(card) : String(card.grade) === grade),
  );

  return (
    <section
      data-anime="motion-panel"
      className="collection-panel"
      aria-label="Card catalog"
    >
      <div className="collection-panel-header">
        <h2>Catalog</h2>
        <Link to="/cards" className="collection-button subtle">
          <Library /> Card Library
        </Link>
      </div>
      <form
        className="builder-search"
        onSubmit={(event) => {
          event.preventDefault();
          resetCatalogScroll();
          setGrade("all");
          onSearch();
        }}
      >
        <input
          aria-label="Search builder catalog"
          value={cardSearch}
          onChange={(event) => onCardSearchChange(event.target.value)}
          placeholder="Card name, nation, ability…"
          className="workspace-control"
        />
        <button
          type="submit"
          disabled={loadingCards}
          className="collection-button"
          aria-label="Search cards"
        >
          <Search />
        </button>
        {(cardSearch || cardResults.length > 0) && (
          <button
            type="button"
            onClick={() => {
              resetCatalogScroll();
              setGrade("all");
              onClearCardSearch();
            }}
            className="collection-button subtle"
            aria-label="Clear card search"
          >
            <X />
          </button>
        )}
      </form>
      <div className="builder-catalog-filters">
        <div
          className="collection-segments"
          role="group"
          aria-label="Filter catalog by grade"
        >
          {["all", "0", "1", "2", "3", "4", "crest"].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={grade === value}
              onClick={() => {
                resetCatalogScroll();
                setGrade(value);
                if (
                  selectedCard &&
                  value !== "all" &&
                  (value === "crest"
                    ? !isCrestCard(selectedCard)
                    : String(selectedCard.grade) !== value)
                ) {
                  onSelectedCardIdChange("");
                }
              }}
            >
              {value === "all"
                ? "All"
                : value === "crest"
                  ? "Crests"
                  : `G${value}`}
            </button>
          ))}
        </div>
        <span className="collection-muted">{visibleCards.length}</span>
      </div>
      <div
        ref={catalogRef}
        className="builder-catalog-list"
        aria-busy={loadingCards}
      >
        {visibleCards.map((card) => (
          <button
            key={card.id}
            data-builder-anime="card-result"
            type="button"
            onClick={() => onSelectedCardIdChange(String(card.id))}
            aria-pressed={selectedCardId === String(card.id)}
            className="builder-catalog-card"
          >
            <div className="collection-artwork">
              <CardArtwork card={card} />
              <span className="collection-grade">{cardGradeBadge(card)}</span>
            </div>
            <span className="min-w-0 flex-1">
              <span className="builder-card-name" title={card.name}>
                {card.name}
              </span>
              <span className="builder-card-meta">
                {formatCardNation(card.nation)} ·{" "}
                {card.primary_printing?.set_code || card.card_type}
              </span>
            </span>
            {selectedCardId === String(card.id) && (
              <Check size={15} className="shrink-0 text-cyan-200" />
            )}
          </button>
        ))}
        {!visibleCards.length && (
          <div className="collection-empty" role="status">
            <Search size={24} />
            <p>
              {loadingCards
                ? "Searching…"
                : cardResults.length
                  ? grade === "crest"
                    ? "No crests found."
                    : "No cards in this grade."
                  : "Search cards · 2+ characters"}
            </p>
          </div>
        )}
      </div>
      {composer}
      <div className="builder-card-tools">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="collection-button subtle"
            disabled={!selectedCard}
            onClick={onInspectSelectedCard}
          >
            <Eye /> Details
          </button>
          {isEditing && (
            <button
              type="button"
              className="collection-button"
              onClick={onResumeCardEdit}
            >
              Resume edit
            </button>
          )}
          <button
            type="button"
            onClick={onEditSelectedCard}
            disabled={!selectedCard}
            className="collection-button subtle"
          >
            <Pencil /> Edit selected
          </button>
        </div>
        {!isEditing && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold">
              New card
            </summary>
            <ManualCardForm
              key={isEditing ? selectedCardId : "new"}
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
        )}
        <CardSetManager
          refreshToken={cardFormOptions.sets
            .map((set) => `${set.code}:${set.name}`)
            .join("|")}
          onSetUpdated={onSetUpdated}
          onSetDeleted={onSetDeleted}
        />
      </div>
    </section>
  );
}
