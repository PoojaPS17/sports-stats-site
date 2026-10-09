"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useSlideIndicator } from "./motion/useSlideIndicator";

export interface SubNavTab {
  label: string;
  href: string;
  /** Match only the exact path (used for the section root so it doesn't light up on every sub-page). */
  exact?: boolean;
  /** Alternative prefix to treat as active (for rewritten URLs). */
  match?: string;
}

// Section navigation shown directly under the site header on league, tennis and F1
// pages. Sticks below the header so the tabs stay reachable on long pages.
export function SubNav({ title, titleHref, tabs }: { title: string; titleHref: string; tabs: SubNavTab[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  useSlideIndicator(navRef, pathname);

  return (
    <div className="sticky top-[var(--header-h)] z-20 -mx-4 mb-6 border-b border-[var(--border)] bg-[var(--bg)]/95 border-[var(--border)] backdrop-blur sm:-mx-6">
      <div className="flex items-center gap-4 px-4 sm:px-6">
        <Link href={titleHref} className="display hidden shrink-0 text-[15px] text-[var(--text)] sm:block">
          {title}
        </Link>
        <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
        <nav ref={navRef} className="slide-host slide-host-tabs -mb-px flex overflow-x-auto" aria-label={`${title} sections`}>
          {tabs.map((tab) => {
            const prefixes = [tab.href, ...(tab.match ? [tab.match] : [])];
            const active = tab.exact ? pathname === tab.href : prefixes.some((p) => pathname === p || pathname?.startsWith(`${p}/`));
            return (
              <Link key={tab.href} href={tab.href} className={`tab ${active ? "tab-active" : ""}`} aria-current={active ? "page" : undefined}>
                {tab.label}
              </Link>
            );
          })}
          <span className="slide-ind" aria-hidden="true" />
        </nav>
      </div>
    </div>
  );
}
