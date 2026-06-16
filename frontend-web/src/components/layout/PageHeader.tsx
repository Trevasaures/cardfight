type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-8">
      {eyebrow ? (
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
          {eyebrow}
        </p>
      ) : null}

      <h2 className="text-3xl font-bold tracking-tight text-slate-50 md:text-4xl">
        {title}
      </h2>

      {description ? (
        <p className="mt-3 max-w-3xl text-base text-slate-400">
          {description}
        </p>
      ) : null}
    </header>
  );
}