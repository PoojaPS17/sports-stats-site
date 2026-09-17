import Link from "next/link";

export function SectionHeader({
  children,
  action,
  description,
}: {
  children: React.ReactNode;
  /** Optional link rendered at the right edge ("Full schedule", "View all"). */
  action?: { label: string; href: string };
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-[var(--text)] sm:text-lg">{children}</h2>
        {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      {action && (
        <Link href={action.href} className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}
