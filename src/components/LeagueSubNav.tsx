"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { League } from "@/lib/queries";

export function LeagueSubNav({ league }: { league: League }) {
  const pathname = usePathname();

  const tabs = [
    { label: "Scores", href: `/${league}` },
    { label: "Standings", href: `/${league}/standings` },
    { label: "Teams", href: `/${league}/teams` },
    { label: "Leaders", href: `/${league}/leaders` },
    { label: "News", href: `/${league}/news` },
  ];

  return (
    <nav className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto border-b border-[var(--border)] px-4 py-2.5 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const active = tab.href === `/${league}` ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={`nav-pill shrink-0 text-sm ${active ? "nav-pill-active" : "text-[var(--text-muted)]"}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
