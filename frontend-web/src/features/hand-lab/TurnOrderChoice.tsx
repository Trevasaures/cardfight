import { Shuffle } from "lucide-react";
import type { TurnOrder } from "./turnOrder";

type Props = {
  value: TurnOrder;
  onChange: (value: TurnOrder) => void;
};

const options: { value: TurnOrder; label: string }[] = [
  { value: "first", label: "Go first" },
  { value: "second", label: "Go second" },
  { value: "random", label: "Random" },
];

export function TurnOrderChoice({ value, onChange }: Props) {
  return (
    <fieldset className="pt-turn-order">
      <legend>Turn order</legend>
      <div className="pt-turn-choice">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.value === "random" ? "Flip a coin when dealing" : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.value === "random" && <Shuffle size={14} aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
