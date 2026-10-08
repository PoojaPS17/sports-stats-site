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
      <SectionHeader description="Season milestones, from results stored on this site. Each name links to the player's page.">
        <span id="home-on-the-brink">On the brink</span>
      </SectionHeader>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <li key={`${i.league}:${i.playerId}:${i.stat}`} className="card relative overflow-hidden">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[var(--accent-2)]" />
            <Link href={`/${i.league}/players/${i.slug}`} className="grid grid-cols-[3.25rem_1fr] items-center gap-3 py-3.5 pl-5 pr-4 hover:bg-[var(--sig-soft)]">
              <span className="text-center leading-none">
                <span className="block text-[32px] font-extrabold tracking-tight text-[var(--text)]">{i.gap}</span>
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">to {i.target.toLocaleString("en-US")}</span>
              </span>
              <span className="min-w-0">
                <span className="block break-words text-[15px] font-extrabold text-[var(--text)]">
                  {i.name}
                  {i.teamName && <span className="font-semibold text-[var(--text-muted)]"> · {i.teamName}</span>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[var(--text-muted)]">{brinkSentence(i, scopeOf(i))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
