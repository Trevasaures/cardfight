import { useEffect, useRef, type PointerEvent } from "react";
import { animate, stagger } from "animejs";
import { Minus, Plus, Zap } from "lucide-react";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { TableCard } from "./playtest";
import type { CrestView } from "./crests";
import type { RuleContext } from "./rules/types";
import { energyLimit } from "./rules/wirbel";
import "./energy-generator.css";

type Props = {
  context: RuleContext;
  generator: CrestView;
  disabled: boolean;
  selected: boolean;
  dragging: boolean;
  onEnergy: (delta: number) => void;
  onToggle: (crest: CrestView) => void;
  onInspect: (card: TableCard) => void;
  onDragStart: (event: PointerEvent<HTMLElement>, card: TableCard) => void;
};

/** Animate only resource changes; snapshots and their undo history remain pure. */
export function EnergyGenerator({
  context,
  generator,
  disabled,
  selected,
  dragging,
  onEnergy,
  onToggle,
  onInspect,
  onDragStart,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const previousEnergy = useRef(context.session.energy);
  const energy = context.session.energy;
  const limit = energyLimit(context);

  useEffect(() => {
    const previous = previousEnergy.current;
    previousEnergy.current = energy;
    const delta = energy - previous;
    const element = root.current;
    if (!element || !delta) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const animations: ReturnType<typeof animate>[] = [];
    const count = element.querySelector(".pt-generator-value");
    const pulse = element.querySelector<HTMLElement>(".pt-generator-change");
    const changed = [
      ...element.querySelectorAll<HTMLElement>("[data-energy-pip]"),
    ].slice(Math.min(previous, energy), Math.max(previous, energy));
    element.dataset.flow = delta > 0 ? "gain" : "spend";
    if (count) {
      animations.push(animate(count, {
        scale: [1, delta > 0 ? 1.18 : 0.9, 1],
        duration: 420,
        ease: "out(3)",
      }));
    }
    if (pulse) {
      pulse.textContent = `${delta > 0 ? "+" : ""}${delta}`;
      animations.push(animate(pulse, {
        opacity: [0, 1, 0],
        y: [3, -8, -15],
        duration: 700,
        ease: "out(3)",
      }));
    }
    if (changed.length) {
      animations.push(animate(changed, {
        scaleY: delta > 0 ? [0.6, 1.65, 1] : [1.3, 0.65, 1],
        opacity: [0.35, 1],
        duration: 460,
        delay: stagger(24),
        ease: "out(3)",
      }));
    }
    // Revert inline styles on rapid corrections, undo, navigation, or a newly
    // enabled reduced-motion preference, keeping the meter's CSS state accurate.
    const stop = () => animations.forEach((animation) => animation.revert());
    const onPreferenceChange = () => {
      if (preference.matches) stop();
    };
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      stop();
      preference.removeEventListener("change", onPreferenceChange);
      delete element.dataset.flow;
    };
  }, [energy]);

  const card = generator.card;
  const artwork = generator.entry?.card;
  return (
    <div
      ref={root}
      className={`pt-generator ${generator.active ? "is-active" : ""} ${selected ? "is-selected" : ""}`}
    >
      <div className="pt-generator-heading">
        {card && artwork ? (
          <button
            type="button"
            className={`pt-generator-art pt-draggable ${dragging ? "is-drag-source" : ""}`}
            aria-label="Inspect Energy Generator"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onInspect(card)}
            onPointerDown={(event) => {
              if (!disabled) onDragStart(event, card);
            }}
          >
            <CardArtwork
              card={artwork}
              printing={generator.entry?.printing}
            />
          </button>
        ) : (
          <Zap size={13} aria-hidden="true" />
        )}
        <span>Energy</span>
        <strong className="pt-generator-value">
          {energy}<small> / {limit}</small>
        </strong>
        <span className="pt-generator-change" aria-hidden="true" />
      </div>
      <div
        className="pt-generator-meter"
        role="meter"
        aria-label="Energy available"
        aria-valuenow={energy}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuetext={`${energy} of ${limit} energy`}
      >
        {Array.from({ length: limit }, (_, index) => (
          <i
            key={index}
            data-energy-pip
            className={index < energy ? "is-filled" : undefined}
          />
        ))}
      </div>
      <div className="pt-generator-controls">
        <button
          type="button"
          disabled={disabled || energy === 0}
          onClick={() => onEnergy(-1)}
          aria-label="Spend one energy"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          className="pt-generator-toggle"
          disabled={disabled}
          onClick={() => onToggle(generator)}
          aria-pressed={generator.active}
          aria-label={`${generator.active ? "Remove" : "Activate"} Energy Generator`}
          title={generator.active ? "Energy Generator active" : "Energy Generator activates when you ride"}
        >
          <i aria-hidden="true" /> Generator
        </button>
        <button
          type="button"
          disabled={disabled || energy >= limit}
          onClick={() => onEnergy(1)}
          aria-label="Gain one energy"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
