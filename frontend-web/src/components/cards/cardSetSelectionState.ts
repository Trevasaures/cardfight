import type { CardSetOption } from "../../types/api";

export type CardSetFormValue = {
  set_selection: string;
  set_code: string;
  set_name: string;
};

export function replaceCardSetSelection<T extends CardSetFormValue>(
  value: T,
  previousCode: string,
  cardSet: CardSetOption,
): T {
  if (value.set_code.trim().toUpperCase() !== previousCode.toUpperCase()) {
    return value;
  }

  return {
    ...value,
    set_selection: cardSet.code,
    set_code: cardSet.code,
    set_name: cardSet.name,
  };
}

export function clearCardSetSelection<T extends CardSetFormValue>(
  value: T,
  setCode: string,
): T {
  if (value.set_code.trim().toUpperCase() !== setCode.toUpperCase()) {
    return value;
  }

  return {
    ...value,
    set_selection: "",
    set_code: "",
    set_name: "",
  };
}
