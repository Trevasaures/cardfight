import type {
  CardFormOptions,
  CardImageAnalysisResult,
  CardSetOption,
} from "../../types/api";
import { NATIONLESS_CARD_OPTION } from "../../utils/cards";

export type ManualCardFormState = {
  name: string;
  grade: string;
  nation: string;
  card_type: string;
  skill_text: string;
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
  skill_text: "",
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
    NATIONLESS_CARD_OPTION,
  ],
  card_types: [
    "Normal Unit",
    "Trigger Unit",
    "G Unit",
    "Normal Order",
    "Blitz Order",
    "Set Order",
  ],
  sets: [],
};

export function withSavedCardSet(
  options: CardFormOptions,
  cardSet: CardSetOption,
): CardFormOptions {
  return {
    ...options,
    sets: [
      ...options.sets.filter((option) => option.code !== cardSet.code),
      cardSet,
    ].sort((left, right) => left.code.localeCompare(right.code)),
  };
}

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

export function cardAnalysisToManualForm(
  result: CardImageAnalysisResult,
): ManualCardFormState {
  return {
    name: result.fields.name,
    grade: result.fields.grade,
    nation: result.fields.nation,
    card_type: result.fields.card_type || "Normal Unit",
    skill_text: "",
    set_selection: result.fields.set_code,
    set_code: result.fields.set_code,
    set_name: result.fields.set_name,
    card_number: result.fields.card_number,
    rarity: result.fields.rarity,
  };
}
