import Link from "next/link";
import { LEAGUES, LEAGUE_LABEL, getRecentAndUpcoming } from "@/lib/queries";
import { GameRow } from "@/components/GameRow";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 60;

export default async function HomePage() {
  const sections = await Promise.all(
    LEAGUES.map(async (league) => ({
      league,
      games: (await getRecentAndUpcoming(league, 1, 1)).slice(0, 6),
    }))
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">NBA &amp; NFL scores, standings and stats</h1>
        <p className="mt-1 text-sm text-neutral-500">Updated daily. Pick a league to see full schedules, standings and player stats.</p>
      </div>

      <AdSlot label="Homepage top" />

      <div className="grid gap-8 sm:grid-cols-2">
        {sections.map(({ league, games }) => (
          <section key={league}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{LEAGUE_LABEL[league]}</h2>
              <Link href={`/${league}`} className="text-sm text-blue-600 hover:underline">
                Full schedule →
              </Link>
            </div>
            <div className="rounded border border-neutral-200 px-4 dark:border-neutral-800">
              {games.length === 0 ? (
                <p className="py-6 text-sm text-neutral-500">No games scheduled right now.</p>
              ) : (
                games.map((g) => <GameRow key={g.espn_id} league={league} game={g} />)
              )}
            </div>
            <div className="mt-2 flex gap-3 text-sm">
              <Link href={`/${league}/standings`} className="text-blue-600 hover:underline">
                Standings
              </Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
