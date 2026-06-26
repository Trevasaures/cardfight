export type ManualCardFormState = {
  name: string;
  grade: string;
  nation: string;
  card_type: string;
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
  set_code: "",
  set_name: "",
  card_number: "",
  rarity: "",
};