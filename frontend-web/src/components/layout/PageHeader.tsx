type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header data-anime="page-header" className="mb-5 min-w-0">
      {eyebrow ? (
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.22em] text-cyan-200/80">
          {eyebrow}
        </p>
      ) : null}

      <h2 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
        {title}
      </h2>

      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      ) : null}
    </header>
  );
}
