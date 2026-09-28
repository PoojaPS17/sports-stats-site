import Link from "next/link";

export function SectionHeader({
  children,
  action,
  description,
  tools,
}: {
  children: React.ReactNode;
  /** Optional link rendered at the right edge ("Full schedule", "View all"). */
  action?: { label: string; href: string };
  description?: React.ReactNode;
  /** Buttons for this section (Share image / Download image), on their own row under the heading. */
  tools?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display flex items-center gap-3 text-[26px] text-[var(--text)] sm:text-[30px]">
            <span aria-hidden className="h-[22px] w-1.5 shrink-0 rounded-sm bg-[var(--sig)]" />
            <span>{children}</span>
          </h2>
          {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        {action && (
          <Link href={action.href} className="shrink-0 text-[13px] font-bold text-[var(--sig-ink)] hover:underline">
            {action.label} →
          </Link>
        )}
      </div>
      {tools && <div className="mt-2.5">{tools}</div>}
    </div>
  );
}
