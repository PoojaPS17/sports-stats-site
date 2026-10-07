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
export function CricketOtherFormats({ name, formats }: { name: string; formats: CricketOtherFormat[] }) {
  return <OtherCompetitions name={name} heading="in other formats" items={formats.map((f) => ({ league: f.league, slug: f.slug, figures: figures(f) }))} />;
}
