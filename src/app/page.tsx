import Link from "next/link";
import { LEAGUE_LABEL, leagueNameWithArticle, SOCCER_LEAGUES, formatSeasonLabel } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { NewsCard } from "@/components/NewsCard";
import { SectionHeader } from "@/components/SectionHeader";
import { SpotlightCard, pickSpotlight } from "@/components/SpotlightCard";
import { HomeCricket } from "@/components/HomeCricket";
import { HomeLive } from "@/components/HomeLive";
import { getHomeData, type HomeSection } from "@/lib/homeData";

// Regenerated every 10 seconds so in-play scores stay current; the stored data
// behind the page is cached in longer tiers (see getHomeData) so each regeneration
// costs only the live ESPN reads.
export const revalidate = 10;

// One pill per sport (football's competitions are the sport's front doors); cricket
// and tennis open on the whole sport, not one competition or tour.
const QUICK_LINKS: { label: string; href: string }[] = [
  ...SOCCER_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` })),
  { label: "NFL", href: "/nfl" },
  { label: "NBA", href: "/nba" },
  { label: "Cricket", href: "/cricket/series" },
  { label: "Tennis", href: "/tennis" },
  { label: "F1", href: "/f1" },
];

function LeagueBlock({ section }: { section: HomeSection }) {
  const { league, games, liveCount } = section;
  return (
    <section>
      <SectionHeader
        action={{ label: "All fixtures", href: `/${league}` }}
        description={liveCount > 0 ? `${liveCount} in play, listed under Live now above` : "Latest results and next fixtures"}
      >
        {LEAGUE_LABEL[league]}
      </SectionHeader>
      <div className="flex flex-col gap-3">
        {games.length === 0 ? (
          <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">Everything this week is listed above.</p>
        ) : (
          games.map((g) => <GameCard key={g.espn_id} league={league} game={g} />)
        )}
      </div>
      <div className="mt-3 flex gap-4 text-sm font-semibold">
        <Link href={`/${league}/standings`} className="text-[var(--accent)] hover:underline">
          Standings
        </Link>
        <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">
          Leaders
        </Link>
        <Link href={`/${league}/teams`} className="text-[var(--accent)] hover:underline">
          Teams
        </Link>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const home = await getHomeData();
  const spotlight = pickSpotlight(home.featured);

  // League blocks most active first; the cricket block ranks by its own live count
  // (a full day of internationals outranks a league with nothing on). Leagues
  // between seasons collapse into one line each at the very end.
  const blocks: React.ReactNode[] = home.sections.map((s) => <LeagueBlock key={s.league} section={s} />);
  const cricketBlock = <HomeCricket key="cricket" live={home.liveCricket.length} next={home.moreCricket} />;
  const cricketAt = home.sections.findIndex((s) => s.liveCount < home.liveCricket.length);
  blocks.splice(cricketAt === -1 ? blocks.length : cricketAt, 0, cricketBlock);

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-6 lg:grid-cols-5 lg:items-center">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Football · Cricket · NFL · NBA · Tennis · F1</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-[1.1] tracking-tight text-[var(--text)] sm:text-4xl lg:text-[2.75rem]">
              Live scores, with the full record behind them
            </h1>
            <p className="mt-3 max-w-xl text-[var(--text-muted)]">
              Open any match for the scorecard or box score, any player for their game log, any team for every season back to
              2015. Cricket goes back further: the IPL from its first season in 2008, World Cups to 1975.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Browse by competition">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {spotlight && (
          <div className="lg:col-span-2">
            <SpotlightCard game={spotlight} />
          </div>
        )}
      </section>

      <HomeLive data={home} />

      <AdSlot label="Homepage" />

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="grid gap-8 sm:grid-cols-2 lg:col-span-2">
          {blocks}
          {home.offSeason.length > 0 && (
            <section className="sm:col-span-2">
              <SectionHeader description="Nothing scheduled in the next few days">Between seasons</SectionHeader>
              <ul className="card divide-y divide-[var(--border)] overflow-hidden">
                {home.offSeason.map(({ league, lastSeason }) => (
                  <li key={league} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span>
                      <span className="font-semibold">{LEAGUE_LABEL[league]}</span>
                      <span className="text-[var(--text-muted)]"> · {leagueNameWithArticle(league, true)} is between seasons</span>
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

        {home.news.length > 0 && (
          <aside className="lg:col-span-1">
            <SectionHeader>Latest news</SectionHeader>
            <div className="flex flex-col gap-2">
              {home.news.map((a) => (
                <NewsCard key={a.article_id} article={a} compact />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
