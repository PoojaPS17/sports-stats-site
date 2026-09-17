import Link from "next/link";
import { LEAGUES, LEAGUE_LABEL, getRecentAndUpcoming, getFeaturedGames, getNews, getMostRecentPlayedSeason } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { SearchBar } from "@/components/SearchBar";
import { NewsCard } from "@/components/NewsCard";
import { SectionHeader } from "@/components/SectionHeader";

export const revalidate = 60;

export default async function HomePage() {
  const featured = (await Promise.all(LEAGUES.map((l) => getFeaturedGames(l, 3)))).flat();

  const sections = await Promise.all(
    LEAGUES.map(async (league) => {
      const games = (await getRecentAndUpcoming(league, 2, 5)).slice(0, 5);
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
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-5 py-4">
        <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Premier League, NFL, NBA &amp; IPL scores, standings and player stats, tracked daily
        </h1>
        <p className="max-w-lg text-[var(--text-muted)]">
          Live scores, full standings, team schedules and player game logs — pulled straight from the league feeds and refreshed every 15 minutes.
        </p>
        <div className="w-full max-w-md">
          <SearchBar large />
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          <SectionHeader>Headline Games</SectionHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            {featured.map((g) => (
              <GameCard key={g.espn_id} league={g.league} game={g} />
            ))}
          </div>
        </section>
      )}

      <AdSlot label="Homepage" />

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ league, games, mostRecentSeason }) => (
          <section key={league}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="border-l-4 border-[var(--accent)] pl-2.5 text-lg font-extrabold tracking-tight text-[var(--text)]">
                {LEAGUE_LABEL[league]}
              </h2>
              <Link href={`/${league}`} className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:underline">
                Full schedule →
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {games.length === 0 ? (
                <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
                  No games in the next few days — {LEAGUE_LABEL[league]} may be between seasons right now.
                  {mostRecentSeason !== null && " See Standings below for the last completed season."}
                </p>
              ) : (
                games.map((g) => <GameCard key={g.espn_id} league={league} game={g} />)
              )}
            </div>
            <div className="mt-3 flex gap-3 text-sm font-semibold">
              <Link href={mostRecentSeason !== null ? `/${league}/standings/${mostRecentSeason}` : `/${league}/standings`} className="text-[var(--accent)] hover:underline">
                Standings
              </Link>
              <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">
                Leaders
              </Link>
            </div>
          </section>
        ))}
      </div>

      {news.length > 0 && (
        <section>
          <SectionHeader>Latest News</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((a) => (
              <NewsCard key={a.article_id} article={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
