import { OtherCompetitions } from "./OtherCompetitions";
import type { CricketOtherFormat } from "@/lib/queries";

const num = (n: number) => n.toLocaleString("en-US");

// One headline figure per competition, enough to say what is behind the link.
function figures(f: CricketOtherFormat): string {
  const parts = [`${num(f.matches)} ${f.matches === 1 ? "match" : "matches"}`];
  if (f.runs > 0) parts.push(`${num(f.runs)} runs`);
  if (f.wickets >= 5) parts.push(`${num(f.wickets)} wkts`);
  return parts.join(" · ");
}

// A cricketer has a page per competition (Tests, ODIs, T20Is, IPL...).
// `note` says a format has no page because the archive does not reach back to his career (cricketCoverage.missingFormatNote).
export function CricketOtherFormats({ name, formats, note = null }: { name: string; formats: CricketOtherFormat[]; note?: string | null }) {
  const strip = <OtherCompetitions name={name} heading="in other formats" items={formats.map((f) => ({ league: f.league, slug: f.slug, figures: figures(f) }))} />;
  if (!note) return strip;
  return (
    <div className="flex flex-col gap-2">
      {strip}
      <p className="text-xs text-[var(--text-muted)]">{note}</p>
    </div>
  );
}
