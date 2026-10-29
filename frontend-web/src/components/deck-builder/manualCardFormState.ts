import type {
  Card,
  CardFormOptions,
  CardImageAnalysisResult,
  CardSetOption,
} from "../../types/api";
import {
  cardNationToFormValue,
  CREST_CARD_TYPES,
  isCrestCard,
  NATIONLESS_CARD_OPTION,
} from "../../utils/cards.ts";
import {
  artworkFromPrinting,
  type CardArtworkValue,
} from "../cards/cardArtworkState.ts";
import { normalizeCardText } from "../../utils/cardText.ts";

export type ManualCardFormState = {
  name: string;
  grade: string;
  nation: string;
  card_type: string;
  skill_text: string;
  artwork: CardArtworkValue | null;
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
  artwork: null,
  set_selection: "",
  set_code: "",
  set_name: "",
  card_number: "",
  rarity: "",
};

export function cardToManualForm(card: Card): ManualCardFormState {
  const printing = card.primary_printing;
  return {
    name: card.name,
    grade: !isCrestCard(card) && card.grade !== null ? String(card.grade) : "",
    nation: cardNationToFormValue(card.nation),
    card_type: card.card_type,
    skill_text: normalizeCardText(card.skill_text),
    artwork: artworkFromPrinting(printing),
    set_selection: printing?.set_code ?? "",
    set_code: printing?.set_code ?? "",
    set_name: printing?.set_name ?? "",
    card_number: printing?.card_number ?? "",
    rarity: printing?.rarity ?? "",
  };
}

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
    ...CREST_CARD_TYPES,
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

export function sharedCardFormIsComplete(value: ManualCardFormState) {
  if (!isCrestCard(value) && !value.grade.trim()) return false;
  return [value.name, value.nation, value.card_type].every(
    (field) => field.trim().length > 0,
  );
}

export function manualCardFormIsComplete(value: ManualCardFormState) {
  return sharedCardFormIsComplete(value) && [
    value.set_code,
    value.set_name,
    value.card_number,
    value.rarity,
  ].every((field) => field.trim().length > 0);
}

export function updateManualCardType(
  value: ManualCardFormState,
  cardType: string,
) {
  return {
    ...value,
    card_type: cardType,
    grade: isCrestCard(cardType) ? "" : value.grade,
  };
}

export function cardAnalysisToManualForm(
  result: CardImageAnalysisResult,
): ManualCardFormState {
  return {
    name: result.fields.name,
    grade: isCrestCard(result.fields.card_type) ? "" : result.fields.grade,
    nation: result.fields.nation,
    card_type: result.fields.card_type || "Normal Unit",
    skill_text: "",
    artwork: null,
    set_selection: result.fields.set_code,
    set_code: result.fields.set_code,
    set_name: result.fields.set_name,
    card_number: result.fields.card_number,
    rarity: result.fields.rarity,
  };
}
