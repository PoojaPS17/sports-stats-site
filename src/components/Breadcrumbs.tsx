import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:text-[var(--accent)]">
            Home
          </Link>
        </li>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="text-[var(--text-faint)]">
                <path d="M3.5 1.5 7 5l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-[var(--accent)]">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "font-medium text-[var(--text)]" : ""} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
