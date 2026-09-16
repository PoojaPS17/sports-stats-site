import Link from "next/link";
import { LEAGUES, LEAGUE_LABEL, getRecentAndUpcoming, getFeaturedGames, getNews } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { SearchBar } from "@/components/SearchBar";
import { NewsCard } from "@/components/NewsCard";

export const revalidate = 60;

export default async function HomePage() {
  const featured = (await Promise.all(LEAGUES.map((l) => getFeaturedGames(l, 3)))).flat();

  const sections = await Promise.all(
    LEAGUES.map(async (league) => ({
      league,
      games: (await getRecentAndUpcoming(league, 2, 5)).slice(0, 5),
    }))
  );

  const news = (await Promise.all(LEAGUES.map((l) => getNews(l, 4))))
    .flat()
    .sort((a, b) => (b.published ? new Date(b.published).getTime() : 0) - (a.published ? new Date(a.published).getTime() : 0))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-5 py-4">
        <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          NBA, NFL &amp; Premier League scores, standings and player stats, tracked daily
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
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Headline games</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {featured.map((g) => (
              <GameCard key={g.espn_id} league={g.league} game={g} />
            ))}
          </div>
        </section>
      )}

      <AdSlot label="Homepage" />

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ league, games }) => (
          <section key={league}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{LEAGUE_LABEL[league]}</h2>
              <Link href={`/${league}`} className="text-sm font-semibold text-[var(--accent)] hover:underline">
                Full schedule →
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {games.length === 0 ? (
                <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games scheduled right now.</p>
              ) : (
                games.map((g) => <GameCard key={g.espn_id} league={league} game={g} />)
              )}
            </div>
            <div className="mt-3 flex gap-3 text-sm font-semibold">
              <Link href={`/${league}/standings`} className="text-[var(--accent)] hover:underline">
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
          <h2 className="mb-3 text-lg font-bold">Latest News</h2>
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
