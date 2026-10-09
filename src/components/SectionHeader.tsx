import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";

export function SectionHeader({
  children,
  action,
  description,
  badge,
  tools,
  menu,
  plain,
}: {
  children: React.ReactNode;
  /** Small tinted chip after the title: the matchweek, the season, or a live count. */
  badge?: React.ReactNode;
  /** Optional link rendered at the right edge ("Full schedule", "View all"). */
  action?: { label: string; href: string };
  description?: React.ReactNode;
  /** Buttons for this section (Share image / Download image), on their own row under the heading. */
  tools?: React.ReactNode;
  /** A single compact control (the match pages' Share menu), right-aligned on the heading row. */
  menu?: React.ReactNode;
  /** The first-visit page's module heading: no accent bar, a 24px (30px from 1000px) title and a 14px grey line under it. */
  plain?: boolean;
}) {
  if (plain) {
    return (
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[24px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[var(--text)] [text-wrap:balance] min-[1000px]:text-[30px]">{children}</h2>
          {description && <p className="mt-1.5 text-sm font-medium leading-snug text-[var(--text-muted)]">{description}</p>}
        </div>
        {action && (
          <Link prefetch={prefetchFor(action.href)} href={action.href} className="shrink-0 pb-0.5 text-[13px] font-bold text-[var(--sig-ink)] hover:underline">
            {action.label} →
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display flex items-center gap-3 text-[26px] text-[var(--text)] sm:text-[30px]">
            <span aria-hidden className="h-[22px] w-1.5 shrink-0 rounded-sm bg-[var(--sig)]" />
            <span>{children}</span>
            {badge && (
              <span className="font-sans rounded-md bg-[var(--sig-soft)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--sig-ink)]">
                {badge}
              </span>
            )}
          </h2>
          {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        {action && (
          <Link prefetch={prefetchFor(action.href)} href={action.href} className="shrink-0 text-[13px] font-bold text-[var(--sig-ink)] hover:underline">
            {action.label} →
          </Link>
        )}
        {menu && <div className="-mt-1 shrink-0 self-start">{menu}</div>}
      </div>
      {tools && <div className="mt-2.5">{tools}</div>}
    </div>
  );
}
