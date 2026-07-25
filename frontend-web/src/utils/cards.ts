export const NATIONLESS_CARD_OPTION = "Nationless";

function isNationlessValue(nation: string | null | undefined) {
  const normalized = nation?.trim().toLowerCase();
  return !normalized || normalized === "none" || normalized === "nationless";
}

export function cardNationToFormValue(nation: string | null | undefined) {
  return isNationlessValue(nation) ? NATIONLESS_CARD_OPTION : nation!.trim();
}

export function cardNationToApiValue(nation: string) {
  return isNationlessValue(nation) ? null : nation.trim();
}

export function formatCardNation(nation: string | null | undefined) {
  return isNationlessValue(nation) ? NATIONLESS_CARD_OPTION : nation!.trim();
}
