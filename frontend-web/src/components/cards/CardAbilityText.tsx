import { normalizeCardText } from "../../utils/cardText";

export function CardAbilityText({ text }: { text: string | null | undefined }) {
  return (
    <p className="card-ability-text">
      {normalizeCardText(text) || "No ability text saved."}
    </p>
  );
}
