import Link from "next/link";
import { LEAGUE_LABEL } from "@/lib/queries";
import type { CricketOtherFormat } from "@/lib/queries";

const num = (n: number) => n.toLocaleString("en-US");

// One headline figure per competition, enough to say what is behind the link.
function figures(f: CricketOtherFormat): string {
  const parts = [`${num(f.matches)} ${f.matches === 1 ? "match" : "matches"}`];
  if (f.runs > 0) parts.push(`${num(f.runs)} runs`);
  if (f.wickets >= 5) parts.push(`${num(f.wickets)} wkts`);
  return parts.join(" · ");
}

// A cricketer has a page per competition (Tests, ODIs, T20Is, IPL...). This strip lets a reader move between them.
export function CricketOtherFormats({ name, formats }: { name: string; formats: CricketOtherFormat[] }) {
  if (formats.length === 0) return null;
  return (
    <nav aria-label={`${name} in other formats`} className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">{name} in other formats</h2>
      <ul className="flex flex-wrap gap-2">
        {formats.map((f) => (
          <li key={f.league}>
            <Link href={`/${f.league}/players/${f.slug}`} className="card flex flex-col px-3 py-2 hover:border-[var(--accent)]">
              <span className="text-sm font-bold">{LEAGUE_LABEL[f.league]}</span>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">{figures(f)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
