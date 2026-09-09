import type { ReactNode } from "react";

type DeckBuilderStepHeaderProps = {
  step: number;
  title: ReactNode;
  description: string;
  action?: ReactNode;
};

export function DeckBuilderStepHeader({
  step,
  title,
  description,
  action,
}: DeckBuilderStepHeaderProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-cyan-100">
          Step {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-slate-50 sm:text-2xl">
            {title}
          </h3>
          <p className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">
            {description}
          </p>
        </div>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
