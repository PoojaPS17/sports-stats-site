"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SubNavTab {
  label: string;
  href: string;
  /** Match only the exact path (used for the section root so it doesn't light up on every sub-page). */
  exact?: boolean;
}

// Section navigation shown directly under the site header on league, tennis and F1
// pages. Sticks below the header so the tabs stay reachable on long pages.
export function SubNav({ title, titleHref, tabs }: { title: string; titleHref: string; tabs: SubNavTab[] }) {
  const pathname = usePathname();

  return (
    <div className="sticky top-[var(--header-h)] z-20 -mx-4 mb-6 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur sm:-mx-6">
      <div className="flex items-center gap-4 px-4 sm:px-6">
        <Link href={titleHref} className="hidden shrink-0 text-sm font-bold tracking-tight text-[var(--text)] sm:block">
          {title}
        </Link>
        <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
        <nav className="-mb-px flex overflow-x-auto" aria-label={`${title} sections`}>
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
            return (
              <Link key={tab.href} href={tab.href} className={`tab ${active ? "tab-active" : ""}`} aria-current={active ? "page" : undefined}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
