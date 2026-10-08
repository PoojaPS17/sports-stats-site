import type { Metadata } from "next";
import Link from "next/link";
import { LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { breakLine } from "@/lib/breakLine";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { NewsCard } from "@/components/NewsCard";
import { SectionHeader } from "@/components/SectionHeader";
import { HomeCricket } from "@/components/HomeCricket";
import { HomeLive } from "@/components/HomeLive";
import { StoryCard } from "@/components/StoryCard";
import { LeagueSnapshot } from "@/components/LeagueSnapshot";
import { getHomeData, type HomeSection } from "@/lib/homeData";
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

function LeagueBlock({ section }: { section: HomeSection }) {
  const { league, games, liveCount, snapshot } = section;
  return (
    <section className="sm:col-span-2">
      <SectionHeader
        action={{ label: "All fixtures", href: `/${league}` }}
        badge={liveCount > 0 ? `${liveCount} live` : snapshot?.seasonLabel}
        description={liveCount > 0 ? `${liveCount} in play, listed under Live now above` : "Latest results and next fixtures"}
      >
        {LEAGUE_LABEL[league]}
      </SectionHeader>
      {games.length === 0 ? (
        <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">Everything this week is listed above.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.slice(0, 3).map((g) => (
            <GameCard key={g.espn_id} league={league} game={g} />
          ))}
        </div>
      )}
      {snapshot && (
        <div className="mt-5">
          <LeagueSnapshot league={league} data={snapshot} />
        </div>
      )}
      <div className="mt-3 flex gap-4 text-sm font-semibold">
        <Link href={`/${league}/standings`} className="text-[var(--accent)] hover:underline">Standings</Link>
        <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">Leaders</Link>
        <Link href={`/${league}/teams`} className="text-[var(--accent)] hover:underline">Teams</Link>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [home, editionContext, counts] = await Promise.all([getHomeData(), getEditionContext(), getSiteCounts()]);
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

  // League blocks most active first; the cricket block ranks by its own live count
  // (a full day of internationals outranks a league with nothing on). Leagues
  // between seasons collapse into one line each at the very end.
  const blocks: React.ReactNode[] = home.sections.map((s) => <LeagueBlock key={s.league} section={s} />);
  const cricketBlock = <HomeCricket key="cricket" live={home.liveCricket.length} next={home.moreCricket} otherSeries={home.otherSeries} />;
  const cricketAt = home.sections.findIndex((s) => s.liveCount < home.liveCricket.length);
  blocks.splice(cricketAt === -1 ? blocks.length : cricketAt, 0, cricketBlock);

  return (
    <div className="flex flex-col gap-10">
      <section className="home-builder-hero band band-deep bleed relative -mt-6 overflow-hidden bg-[radial-gradient(600px_300px_at_100%_0%,rgba(56,182,232,0.18),transparent_60%),radial-gradient(500px_260px_at_0%_100%,rgba(37,99,217,0.35),transparent_60%)] py-7 sm:py-11" suppressHydrationWarning>
        <SportPicker ctx={editionContext} lines={lines} liveNow={home.liveGames.length + home.liveCricket.length + home.liveTennis.length} counts={counts} />
      </section>
      <CollapsedBar />
      <div className="home-firstvisit home-mods">
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
      <h2 className="home-else display text-[28px] text-[var(--text)]">Everything else is still here</h2>
      <h2 className="home-scores-h text-[24px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[var(--text)] min-[1000px]:text-[30px]">Scores, tables and leaders</h2>

      <HomeLive data={home} />

      <AdSlot label="Homepage" />

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="grid gap-8 sm:grid-cols-2 lg:col-span-2">
          {blocks}
          {home.offSeason.length > 0 && (
            <section className="sm:col-span-2">
              <SectionHeader description="Nothing scheduled in the next few days">{home.offSeason.every((s) => s.resumesOn === null) ? "Between seasons" : "Nothing on this week"}</SectionHeader>
              <ul className="card divide-y divide-[var(--border)] overflow-hidden">
                {home.offSeason.map(({ league, lastSeason, resumesOn }) => (
                  <li key={league} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span>
                      <span className="font-semibold">{LEAGUE_LABEL[league]}</span>
                      <span className="text-[var(--text-muted)]"> · {breakLine(league, resumesOn)}</span>
                    </span>
                    <span className="flex gap-4 font-semibold text-[var(--accent)]">
                      <Link href={lastSeason !== null ? `/${league}/standings/${lastSeason}` : `/${league}/standings`} className="hover:underline">
                        {lastSeason !== null ? `${formatSeasonLabel(league, lastSeason)} standings` : "Standings"}
                      </Link>
                      <Link href={`/${league}/leaders`} className="hover:underline">
                        Leaders
                      </Link>
                      <Link href={`/${league}`} className="hover:underline">
                        Fixtures
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {(home.news.length > 0 || beyondTheScorelineArticles.length > 0) && (
          <div className="lg:col-span-1 flex flex-col gap-10">
            {beyondTheScorelineArticles.length > 0 && (
              <aside className="home-desk-lower">
                <SectionHeader action={{ label: "All articles", href: "/beyond-the-scoreline" }}>Beyond the Scoreline</SectionHeader>
                <div className="flex flex-col gap-2">
                  {beyondTheScorelineArticles.map((a) => (
                    <StoryCard key={a.slug} article={a} variant="row" />
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--sig)_40%,transparent)] bg-[var(--sig-soft)] p-4">
                  <p className="display text-[22px] text-[var(--text)]">Follow the desk</p>
                  <p className="mt-1 text-[13px] text-[var(--text-muted)]">Every result and every record, posted the same day.</p>
                  <a
                    href="https://x.com/sportsdblive"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block rounded-lg bg-[var(--mast)] px-3.5 py-2 text-[13px] font-bold text-[var(--mast-text)]"
                  >
                    @sportsdblive on X
                  </a>
                </div>
              </aside>
            )}
            {home.news.length > 0 && (
              <aside>
                <SectionHeader>Latest news</SectionHeader>
                <div className="flex flex-col gap-2">
                  {home.news.map((a) => (
                    <NewsCard key={a.article_id} article={a} compact />
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
