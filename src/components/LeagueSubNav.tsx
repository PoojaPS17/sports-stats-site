"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { League } from "@/lib/queries";

export function LeagueSubNav({ league }: { league: League }) {
  const pathname = usePathname();

  const tabs = [
    { label: "Scores", href: `/${league}` },
    { label: "Standings", href: `/${league}/standings` },
    { label: "Leaders", href: `/${league}/leaders` },
    { label: "News", href: `/${league}/news` },
  ];

  return (
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)] px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const active = tab.href === `/${league}` ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-bold transition ${
              active
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
