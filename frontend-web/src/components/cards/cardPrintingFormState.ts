import type {
  Card,
  CardPrinting,
  CreateCardPrintingPayload,
} from "../../types/api";
import {
  artworkFromPrinting,
  artworkPayload,
  type CardArtworkValue,
} from "./cardArtworkState.ts";

export type CardPrintingFormState = {
  artwork: CardArtworkValue | null;
  set_selection: string;
  set_code: string;
  set_name: string;
  card_number: string;
  rarity: string;
};

export const EMPTY_CARD_PRINTING_FORM: CardPrintingFormState = {
  artwork: null,
  set_selection: "",
  set_code: "",
  set_name: "",
  card_number: "",
  rarity: "",
};

export function printingToForm(printing: CardPrinting): CardPrintingFormState {
  return {
    artwork: artworkFromPrinting(printing),
    set_selection: printing.set_code ?? "",
    set_code: printing.set_code ?? "",
    set_name: printing.set_name ?? "",
    card_number: printing.card_number ?? "",
    rarity: printing.rarity ?? "",
  };
}

/** Printing edits deliberately exclude the shared card's rules and stats. */
export function printingFormPayload(
  value: CardPrintingFormState,
): CreateCardPrintingPayload {
  return {
    set_code: value.set_code,
    set_name: value.set_name,
    card_number: value.card_number,
    rarity: value.rarity,
    ...artworkPayload(value.artwork),
  };
}

/**
 * Older combined-editor drafts can still contain unsaved primary artwork.
 * Expose those fields for one final atomic save instead of silently dropping them.
 */
export function hasPrintingDraftChanges(card: Card, draft: CardPrintingFormState) {
  const original = card.primary_printing
    ? printingToForm(card.primary_printing)
    : EMPTY_CARD_PRINTING_FORM;
  return (
    JSON.stringify(printingFormPayload(draft)) !==
    JSON.stringify(printingFormPayload(original))
  );
}

/** Apply the server response without resetting the inspector's printing choice. */
export function withSavedPrinting(card: Card, printing: CardPrinting): Card {
  const exists = card.printings.some((item) => item.id === printing.id);
  return {
    ...card,
    printings: exists
      ? card.printings.map((item) =>
          item.id === printing.id ? printing : item,
        )
      : [...card.printings, printing],
    primary_printing:
      !card.primary_printing || card.primary_printing.id === printing.id
        ? printing
        : card.primary_printing,
  };
}

export function cardPrintingFormIsComplete(value: CardPrintingFormState) {
  return [
    value.set_code,
    value.set_name,
    value.card_number,
    value.rarity,
  ].every((field) => field.trim().length > 0);
}
