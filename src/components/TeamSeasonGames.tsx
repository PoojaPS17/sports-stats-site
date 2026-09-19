import { GameCard } from "./GameCard";
import { SectionHeader } from "./SectionHeader";
import { SeasonTabs } from "./SeasonTabs";
import { DownloadCard } from "./DownloadCard";
import { TeamScheduleExportCard } from "./TeamScheduleExportCard";
import { formatSeasonLabel, type GameRow, type League } from "@/lib/queries";

export function TeamSeasonGames({
  league,
  games,
  seasons,
  activeSeason,
  basePath,
  teamName,
  teamLogo,
  teamColor,
}: {
  league: League;
  games: GameRow[];
  seasons: number[];
  activeSeason: number | null;
  basePath: string;
  /** For the downloadable season card - the crest and colour already loaded for the page. */
  teamName: string;
  teamLogo: string | null;
  teamColor: string | null;
}) {
  const seasonLabel = activeSeason !== null ? (formatSeasonLabel(league, activeSeason) ?? String(activeSeason)) : "Current season";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader>Results &amp; Schedule</SectionHeader>
        {games.length > 0 && (
          <DownloadCard
            compact
            filename={`${basePath.split("/").pop()}-${seasonLabel}-${league}`.toLowerCase()}
            width={860}
            card={<TeamScheduleExportCard league={league} teamName={teamName} teamLogo={teamLogo} teamColor={teamColor} seasonLabel={seasonLabel} games={games} />}
          />
        )}
      </div>
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
