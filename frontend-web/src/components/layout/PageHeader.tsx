type PageHeaderProps = {
  title: string;
};

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <h1 id="page-title" className="sr-only">{title}</h1>
  );
}
