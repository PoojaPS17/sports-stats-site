import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { LEAGUE_LABEL, formatSeasonLabel } from "@/lib/leagues";
import { brinkSentence, type BrinkItem } from "@/lib/brink";
import { getBrink } from "@/lib/brinkData";

// "On the brink": players a few units short of a round number in a season being played now. Every claim is scoped
// to the season in its own sentence ("in the 2026 MLS regular season") because it is a season total, never a career
// total: the archive does not hold every career, so no career milestone is ever claimed (lib/brink.ts). The same
// server HTML for every visitor; hidden once a visitor has a saved setup (.home-firstvisit). With nothing true to
// show the section is left out altogether.

export const scopeOf = (i: Pick<BrinkItem, "league" | "season">) => `the ${formatSeasonLabel(i.league, i.season)} ${LEAGUE_LABEL[i.league]} regular season`;

export async function OnTheBrink() {
  return <OnTheBrinkView items={await getBrink()} />;
}

export function OnTheBrinkView({ items }: { items: BrinkItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="home-firstvisit" data-module="on-the-brink" aria-labelledby="home-on-the-brink">
      <SectionHeader plain description="Season milestones, from results stored on this site. Each name links to the player's page.">
        <span id="home-on-the-brink">On the brink</span>
      </SectionHeader>
      <ul className="card fcard">
        {items.map((i) => {
          const pct = Math.min(100, Math.max(0, (i.value / i.target) * 100));
          return (
            <li key={`${i.league}:${i.playerId}:${i.stat}`} className="rw">
              <Link href={`/${i.league}/players/${i.slug}`} className="rw-link">
                <span className="rw-t">
                  <b>
                    {i.name}
                    {i.teamName && <span> · {i.teamName}</span>}
                  </b>
                  <span className="rw-to">
                    {i.gap.toLocaleString("en-US")}
                    <small>to go</small>
                  </span>
                </span>
                <span className="rw-s">
                  {i.value.toLocaleString("en-US")} {i.unit} → {i.target.toLocaleString("en-US")}
                </span>
                <span className="rw-bar" role="img" aria-label={`${Math.round(pct)}% of the way to ${i.target.toLocaleString("en-US")} ${i.unit}`}>
                  <i className="bar-grow" style={{ width: `${pct.toFixed(1)}%` }} />
                </span>
                <span className="rw-s">{brinkSentence(i, scopeOf(i))}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
