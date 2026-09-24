import type { ReactNode } from "react";

type DeckBuilderStepHeaderProps = {
  title: ReactNode;
  action?: ReactNode;
};

export function DeckBuilderStepHeader({
  title,
  action,
}: DeckBuilderStepHeaderProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <h3 className="section-title">
            {title}
          </h3>
        </div>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
