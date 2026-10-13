export const NATIONLESS_CARD_OPTION = "Nationless";

export const CREST_CARD_TYPES = ["Crest", "Ride Deck Crest"] as const;

/** Crests are setup cards with no printed grade, including Energy Generator. */
export function isCrestCard(
  cardOrType: { card_type?: string | null } | string | null | undefined,
) {
  const cardType =
    typeof cardOrType === "string" ? cardOrType : cardOrType?.card_type;
  return CREST_CARD_TYPES.some(
    (type) => type.toLowerCase() === cardType?.trim().toLowerCase(),
  );
}

type CardGrade = { card_type: string; grade: number | null };

export function cardGradeBadge(card: CardGrade) {
  return isCrestCard(card)
    ? "Crest"
    : card.grade === null
      ? "G?"
      : `G${card.grade}`;
}

export function cardGradeLabel(card: CardGrade) {
  return isCrestCard(card)
    ? "Crest"
    : card.grade === null
      ? "Unknown grade"
      : `Grade ${card.grade}`;
}

export function cardGradeToApiValue(form: {
  card_type: string;
  grade: string;
}) {
  return isCrestCard(form) ? null : form.grade;
}

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
