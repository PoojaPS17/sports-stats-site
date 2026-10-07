import Link from "next/link";
import { LEAGUE_LABEL } from "@/lib/queries";
import type { League } from "@/lib/queries";

export interface OtherCompetition { league: League; slug: string; figures: string }

// A player has a page per competition he plays in; this strip lets a reader move between them.
export function OtherCompetitions({ name, heading, items }: { name: string; heading: string; items: OtherCompetition[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={`${name} ${heading}`} className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">{name} {heading}</h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((f) => (
          <li key={f.league}>
            <Link href={`/${f.league}/players/${f.slug}`} className="card flex flex-col px-3 py-2 hover:border-[var(--accent)]">
              <span className="text-sm font-bold">{LEAGUE_LABEL[f.league]}</span>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">{f.figures}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
