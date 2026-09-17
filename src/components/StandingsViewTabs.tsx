import Link from "next/link";
import type { League } from "@/lib/queries";
import type { TableScope } from "@/lib/analytics";

const VIEWS: { key: TableScope; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "home", label: "Home" },
  { key: "away", label: "Away" },
  { key: "form", label: "Form" },
];

// Overall / Home / Away / Form switch on the standings page. "Overall" is the
// official table at /standings; the other three are computed tables at
// /standings/home, /standings/away and /standings/form.
export function StandingsViewTabs({ league, active }: { league: League; active: TableScope }) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1" role="tablist" aria-label="Table view">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.key === "overall" ? `/${league}/standings` : `/${league}/standings/${v.key}`}
          role="tab"
          aria-selected={active === v.key}
          className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
            active === v.key ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
