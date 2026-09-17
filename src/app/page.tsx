import Link from "next/link";
import {
  LEAGUES,
  LEAGUE_LABEL,
  SOCCER_LEAGUES,
  CRICKET_LEAGUES,
  getRecentAndUpcoming,
  getFeaturedGames,
  getNews,
  getMostRecentPlayedSeason,
  formatSeasonLabel,
} from "@/lib/queries";
import { TOURS, TOUR_LABEL } from "@/lib/tennisTours";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { NewsCard } from "@/components/NewsCard";
import { SectionHeader } from "@/components/SectionHeader";

export const revalidate = 60;

const QUICK_LINKS: { label: string; href: string }[] = [
  ...SOCCER_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` })),
  { label: "NFL", href: "/nfl" },
  { label: "NBA", href: "/nba" },
  ...CRICKET_LEAGUES.slice(0, 2).map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` })),
  ...TOURS.map((t) => ({ label: TOUR_LABEL[t], href: `/tennis/${t}` })),
  { label: "F1", href: "/f1" },
];

export default async function HomePage() {
  const featured = (await Promise.all(LEAGUES.map((l) => getFeaturedGames(l, 3)))).flat();

  const sections = await Promise.all(
    LEAGUES.map(async (league) => {
      const games = (await getRecentAndUpcoming(league, 2, 5)).slice(0, 4);
      // A standings row for the upcoming season already exists (every team 0-0) well
      // before it starts, so the plain /standings link would default right back to an
      // empty table during preseason — point at the season that's actually been played.
      const mostRecentSeason = games.length === 0 ? await getMostRecentPlayedSeason(league) : null;
      return { league, games, mostRecentSeason };
    })
  );

  const news = (await Promise.all(LEAGUES.map((l) => getNews(l, 4))))
    .flat()
    .sort((a, b) => (b.published ? new Date(b.published).getTime() : 0) - (a.published ? new Date(a.published).getTime() : 0))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="page-title max-w-2xl">Live scores, standings and stats across the sports you follow</h1>
          <p className="mt-2 max-w-xl text-[var(--text-muted)]">
            Fixtures, results, tables, player game logs and ten seasons of history for football, the NFL, NBA, cricket,
            tennis and Formula 1. Refreshed automatically from the league feeds.
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
      </section>

      {featured.length > 0 && (
        <section>
          <SectionHeader description="Recent results and the biggest fixtures coming up">Headline games</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((g) => (
              <GameCard key={g.espn_id} league={g.league} game={g} />
            ))}
          </div>
        </section>
      )}

      <AdSlot label="Homepage" />

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="grid gap-8 sm:grid-cols-2 lg:col-span-2">
          {sections.map(({ league, games, mostRecentSeason }) => (
            <section key={league}>
              <SectionHeader action={{ label: "All fixtures", href: `/${league}` }}>{LEAGUE_LABEL[league]}</SectionHeader>
              <div className="flex flex-col gap-3">
                {games.length === 0 ? (
                  <div className="card px-4 py-5 text-sm text-[var(--text-muted)]">
                    <p>The {LEAGUE_LABEL[league]} is between seasons. No fixtures in the next few days.</p>
                    {mostRecentSeason !== null && (
                      <Link
                        href={`/${league}/standings/${mostRecentSeason}`}
                        className="mt-2 inline-block font-semibold text-[var(--accent)] hover:underline"
                      >
                        View the {formatSeasonLabel(league, mostRecentSeason)} standings →
                      </Link>
                    )}
                  </div>
                ) : (
                  games.map((g) => <GameCard key={g.espn_id} league={league} game={g} />)
                )}
              </div>
              <div className="mt-3 flex gap-4 text-sm font-semibold">
                <Link
                  href={mostRecentSeason !== null ? `/${league}/standings/${mostRecentSeason}` : `/${league}/standings`}
                  className="text-[var(--accent)] hover:underline"
                >
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
          ))}
        </div>

        {news.length > 0 && (
          <aside className="lg:col-span-1">
            <SectionHeader>Latest news</SectionHeader>
            <div className="flex flex-col gap-2">
              {news.map((a) => (
                <NewsCard key={a.article_id} article={a} compact />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
