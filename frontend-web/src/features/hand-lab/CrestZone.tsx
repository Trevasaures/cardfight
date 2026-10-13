import type { PointerEvent } from "react";
import { Shield } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { TableCard } from "./playtest";
import type { RuleContext } from "./rules/types";
import { crestViews, type CrestView } from "./crests";
import { EnergyGenerator } from "./EnergyGenerator";
import "./crests.css";

type Props = {
  context: RuleContext;
  disabled: boolean;
  selected: readonly string[];
  draggedKeys: readonly string[];
  dropClassName: string;
  onInspect: (card: TableCard) => void;
  onToggle: (crest: CrestView) => void;
  onEnergy: (delta: number) => void;
  onDragStart: (event: PointerEvent<HTMLElement>, card: TableCard) => void;
};

/** Active and available crests stay visible together without entering the main deck. */
export function CrestZone({
  context,
  disabled,
  selected,
  draggedKeys,
  dropClassName,
  onInspect,
  onToggle,
  onEnergy,
  onDragStart,
}: Props) {
  const crests = crestViews(context);
  const generator = crests.find(
    (crest) => crest.energyGenerator && crest.active,
  )
    ?? crests.find((crest) => crest.energyGenerator);
  // Energy and its generator share one tile. Optional deck crests remain separate.
  const orderedCrests = crests.filter((crest) => !crest.energyGenerator)
    .sort((left, right) => Number(right.active) - Number(left.active));
  return (
    <section
      className={`pt-crest-zone ${dropClassName}`}
      data-drop-zone="crest"
      aria-label="Energy and crests"
    >
      <div className="pt-crest-list">
        {generator && (
          <EnergyGenerator
            context={context}
            generator={generator}
            disabled={disabled}
            selected={Boolean(generator.card && selected.includes(generator.card.key))}
            dragging={Boolean(generator.card && draggedKeys.includes(generator.card.key))}
            onEnergy={onEnergy}
            onToggle={onToggle}
            onInspect={onInspect}
            onDragStart={onDragStart}
          />
        )}
        {orderedCrests.map((crest) => {
          const name = crest.entry?.card?.name ?? "Crest";
          const isSelected = Boolean(
            crest.card && selected.includes(crest.card.key),
          );
          return (
            <div
              key={crest.key}
              className={`pt-crest-tile ${crest.active ? "is-active" : ""} ${isSelected ? "is-selected" : ""}`}
            >
              {crest.card && crest.entry?.card ? (
                <button
                  type="button"
                  className={`pt-crest-art pt-draggable ${draggedKeys.includes(crest.card.key) ? "is-drag-source" : ""}`}
                  aria-label={`Inspect ${name}`}
                  aria-pressed={isSelected}
                  disabled={disabled}
                  onClick={() => onInspect(crest.card!)}
                  onPointerDown={(event) => {
                    if (!disabled) onDragStart(event, crest.card!);
                  }}
                >
                  <CardArtwork
                    card={crest.entry.card}
                    printing={crest.entry.printing}
                  />
                </button>
              ) : (
                <div
                  className="pt-crest-art pt-virtual-crest"
                  aria-hidden="true"
                >
                  <Shield size={24} strokeWidth={1} />
                </div>
              )}
              <div className="pt-crest-info">
                <strong title={name}>{name}</strong>
                <button
                  type="button"
                  className="hand-button"
                  disabled={disabled}
                  title="Activate when its card effect grants this crest"
                  onClick={() => onToggle(crest)}
                  aria-label={`${crest.active ? "Remove" : "Activate"} ${name}`}
                >
                  {crest.active ? "Remove" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
