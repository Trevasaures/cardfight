import type { CardFormOptions } from "../../types/api";

export type ManualCardFormState = {
  name: string;
  grade: string;
  nation: string;
  card_type: string;
  set_selection: string;
  set_code: string;
  set_name: string;
  card_number: string;
  rarity: string;
};

export const EMPTY_MANUAL_CARD_FORM: ManualCardFormState = {
  name: "",
  grade: "",
  nation: "",
  card_type: "Normal Unit",
  set_selection: "",
  set_code: "",
  set_name: "",
  card_number: "",
  rarity: "",
};

export const DEFAULT_CARD_FORM_OPTIONS: CardFormOptions = {
  grades: [0, 1, 2, 3, 4],
  nations: [
    "Dragon Empire",
    "Dark States",
    "Brandt Gate",
    "Keter Sanctuary",
    "Stoicheia",
    "Lyrical Monasterio",
  ],
  card_types: [
    "Normal Unit",
    "Trigger Unit",
    "Normal Order",
    "Blitz Order",
    "Set Order",
  ],
  sets: [],
};

export function manualCardFormIsComplete(value: ManualCardFormState) {
  return [
    value.name,
    value.grade,
    value.nation,
    value.card_type,
    value.set_code,
    value.set_name,
    value.card_number,
    value.rarity,
  ].every((field) => field.trim().length > 0);
}
