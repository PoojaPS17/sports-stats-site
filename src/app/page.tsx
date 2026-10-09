import type { Metadata } from "next";
import { SectionHeader } from "@/components/SectionHeader";
import { StoryCard } from "@/components/StoryCard";
import { getHomeData } from "@/lib/homeData";
import { listArticles } from "@/lib/beyondTheScoreline";
import { absoluteUrl } from "@/lib/site";
import { SportPicker } from "@/components/home/SportPicker";
import { HomeBlocks } from "@/components/home/HomeBlocks";
import { CollapsedBar } from "@/components/home/CollapsedBar";
import { RightNow } from "@/components/home/RightNow";
import { TodayInThreeLines } from "@/components/home/TodayInThreeLines";
import { getEditionContext } from "@/lib/editionContext";
import { sportLines } from "@/lib/sportPicks";
import { getSiteCounts } from "@/lib/siteCounts";
import { getPopularFollows } from "@/lib/popularFollows";
import { TryAName } from "@/components/home/TryAName";
import { BestOfWeek } from "@/components/home/BestOfWeek";
import { WhoLeads } from "@/components/home/WhoLeads";
import { OnTheBrink } from "@/components/home/OnTheBrink";
import { HomeExplainers } from "@/components/home/HomeExplainers";

// Title, description and share card come from the root layout. The canonical lives here and not
// in the layout, so no page can inherit the home address by accident.
export const metadata: Metadata = { alternates: { canonical: absoluteUrl("/") } };

// Regenerated every 10 seconds so in-play scores stay current; the stored data
// behind the page is cached in longer tiers (see getHomeData) so each regeneration
// costs only the live ESPN reads.
export const revalidate = 10;

export default async function HomePage() {
  const [home, editionContext, counts, popular] = await Promise.all([getHomeData(), getEditionContext(), getSiteCounts(), getPopularFollows()]);
  const beyondTheScorelineArticles = listArticles().slice(0, 3);
  const iso = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  const lines = sportLines({
    liveCricket: home.liveCricket.length,
    liveTennis: home.liveTennis.length,
    sections: home.sections,
    liveGames: home.liveGames,
    nextFixtures: home.nextFixtures,
    nextCricket: [...home.nextCricket, ...home.moreCricket].map((m) => m.date),
    nextTennis: home.nextTennis.map((m) => m.date),
    nextF1: home.f1 ? { start: iso(home.f1.race_date ?? home.f1.date)!, end: iso(home.f1.end_date) } : null,
  });

  return (
    <div className="flex flex-col gap-10">
      <section className="home-builder-hero pick bleed" suppressHydrationWarning>
        <div className="pick-deco" aria-hidden>
          <i className="c1" />
          <i className="c2" />
          <i className="d1" />
          <i className="d2" />
          <i className="c3" />
        </div>
        <SportPicker popular={popular} ctx={editionContext} lines={lines} liveNow={home.liveGames.length + home.liveCricket.length + home.liveTennis.length} counts={counts} />
      </section>
      <CollapsedBar />
      <div className="home-firstvisit home-mods motion-stagger">
        <div className="home-duo home-duo-wide">
          <div className="home-col">
            <RightNow />
            <TodayInThreeLines />
          </div>
          <TryAName />
        </div>
        <BestOfWeek />
        <div className="home-duo">
          <WhoLeads />
          <OnTheBrink />
        </div>
        <HomeExplainers lines={lines} />
        {beyondTheScorelineArticles.length > 0 && (
          <section data-module="from-the-desk" aria-labelledby="home-from-the-desk">
            <SectionHeader plain action={{ label: "Beyond the Scoreline", href: "/beyond-the-scoreline" }}>
              <span id="home-from-the-desk">From the desk</span>
            </SectionHeader>
            <div className="grid gap-3 sm:grid-cols-2 min-[1000px]:grid-cols-3">
              {beyondTheScorelineArticles.map((a) => (
                <StoryCard key={a.slug} article={a} variant="row" />
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="home-skeleton" aria-hidden />
      <HomeBlocks ctx={editionContext} />
      <div id="home-final-cta" className="empty:hidden" />
    </div>
  );
}
