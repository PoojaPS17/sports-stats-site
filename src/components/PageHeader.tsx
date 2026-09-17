export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional controls rendered on the right (season picker, filters). */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
