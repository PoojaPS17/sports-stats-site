import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { JsonLd } from "./JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, tone }: { items: Crumb[]; /** "band": for use on a navy `.band` section instead of a light surface. */ tone?: "band" }) {
  const onBand = tone === "band";
  const linkClass = onBand ? "hover:text-[var(--sig)]" : "hover:text-[var(--accent)]";
  const lastClass = onBand ? "text-[var(--mast-text)]" : "text-[var(--text)]";
  return (
    <nav aria-label="Breadcrumb" className={`text-xs ${onBand ? "text-[var(--mast-muted)]" : "text-[var(--text-muted)]"}`}>
      <JsonLd data={breadcrumbSchema(items)} />
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className={linkClass}>
            Home
          </Link>
        </li>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={onBand ? "text-[var(--mast-muted)]" : "text-[var(--text-faint)]"}>
                <path d="M3.5 1.5 7 5l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.href && !last ? (
                <Link prefetch={prefetchFor(item.href)} href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              ) : (
                <span className={last ? `font-medium ${lastClass}` : ""} aria-current={last ? "page" : undefined}>
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
