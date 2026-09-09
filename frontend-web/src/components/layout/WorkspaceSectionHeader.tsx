import type { ReactNode } from "react";

type WorkspaceSectionHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function WorkspaceSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: WorkspaceSectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-cyan-100">
          {eyebrow}
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-lg font-black leading-snug text-slate-50 sm:text-xl">
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
