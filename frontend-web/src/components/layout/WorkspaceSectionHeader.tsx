import type { ReactNode } from "react";

type WorkspaceSectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function WorkspaceSectionHeader({
  title,
  description,
  actions,
  className = "",
}: WorkspaceSectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="section-heading min-w-0 flex-1 basis-60">
        <div className="min-w-0">
          <h3 className="section-title">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
