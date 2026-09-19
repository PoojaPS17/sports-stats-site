import { GameCard } from "./GameCard";
import { SectionHeader } from "./SectionHeader";
import { SeasonTabs } from "./SeasonTabs";
import type { GameRow, League } from "@/lib/queries";

export function TeamSeasonGames({
  league,
  games,
  seasons,
  activeSeason,
  basePath,
}: {
  league: League;
  games: GameRow[];
  seasons: number[];
  activeSeason: number | null;
  basePath: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Results &amp; Schedule</SectionHeader>
      <SeasonTabs league={league} basePath={basePath} seasons={seasons} activeSeason={activeSeason} />
      {games.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games found for this season.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <GameCard key={g.espn_id} league={league} game={g} />
          ))}
        </div>
      )}
    </section>
  );
}
