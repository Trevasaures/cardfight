export type CardPrintingFormState = {
  set_selection: string;
  set_code: string;
  set_name: string;
  card_number: string;
  rarity: string;
};

export const EMPTY_CARD_PRINTING_FORM: CardPrintingFormState = {
  set_selection: "",
  set_code: "",
  set_name: "",
  card_number: "",
  rarity: "",
};

export function cardPrintingFormIsComplete(value: CardPrintingFormState) {
  return [
    value.set_code,
    value.set_name,
    value.card_number,
    value.rarity,
  ].every((field) => field.trim().length > 0);
}
