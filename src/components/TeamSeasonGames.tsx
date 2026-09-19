import { GameCard } from "./GameCard";
import { SectionHeader } from "./SectionHeader";
import { SeasonTabs } from "./SeasonTabs";
import { ImageActions } from "./ImageActions";
import { TeamScheduleExportCard } from "./TeamScheduleExportCard";
import { teamDisplayName } from "@/lib/teamName";
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
      <SectionHeader
        tools={
          games.length > 0 && (
            <ImageActions
              filename={`${basePath.split("/").pop()}-${seasonLabel}-${league}`.toLowerCase()}
              width={860}
              shareTitle={`${teamDisplayName(teamName)} ${seasonLabel} results`}
              card={<TeamScheduleExportCard league={league} teamName={teamName} teamLogo={teamLogo} teamColor={teamColor} seasonLabel={seasonLabel} games={games} />}
            />
          )
        }
      >
        Results &amp; Schedule
      </SectionHeader>
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
