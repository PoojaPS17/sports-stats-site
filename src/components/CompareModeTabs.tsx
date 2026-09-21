import Link from "next/link";
import { isLeague, isCricketLeague } from "@/lib/leagues";

export function CompareModeTabs({ league, active }: { league: string; active: "teams" | "players" }) {
  // Cricket compares players only; a Teams tab would bounce straight back to this page.
  if (isLeague(league) && isCricketLeague(league)) return null;
  const tabs = [
    { key: "teams", label: "Teams", href: `/${league}/compare` },
    { key: "players", label: "Players", href: `/${league}/compare/players` },
  ] as const;
  return (
    <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
            active === t.key ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
