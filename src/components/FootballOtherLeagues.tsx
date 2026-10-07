import { OtherCompetitions } from "./OtherCompetitions";
import type { FootballOtherLeague } from "@/lib/queries";

const num = (n: number) => n.toLocaleString("en-US");

function figures(f: FootballOtherLeague): string {
  const parts = [`${num(f.apps)} ${f.apps === 1 ? "app" : "apps"}`];
  if (f.goals > 0) parts.push(`${num(f.goals)} ${f.goals === 1 ? "goal" : "goals"}`);
  if (f.assists > 0) parts.push(`${num(f.assists)} ${f.assists === 1 ? "assist" : "assists"}`);
  return parts.join(" · ");
}

// A footballer has a page per competition (league, Champions League, Europa League...).
export function FootballOtherLeagues({ name, leagues }: { name: string; leagues: FootballOtherLeague[] }) {
  return <OtherCompetitions name={name} heading="in other competitions" items={leagues.map((f) => ({ league: f.league, slug: f.slug, figures: figures(f) }))} />;
}
