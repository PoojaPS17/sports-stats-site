import { notFound } from "next/navigation";
import { isLeague, getGameByEspnId, getPlayerSlugsByEspnIds } from "@/lib/queries";
import {
  fetchMatchSummary,
  parseTeamStats,
  parseAmericanPlayerBox,
  parseSoccerPlayerBox,
  parseCricketScorecard,
} from "@/lib/matchDetail";
import { AdSlot } from "@/components/AdSlot";
import { MatchHeader } from "@/components/MatchHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamStatsComparison } from "@/components/TeamStatsComparison";
import { PlayerBoxScoreTable } from "@/components/PlayerBoxScoreTable";
import { CricketScorecard } from "@/components/CricketScorecard";

// A live fetch to ESPN backs this page (see lib/matchDetail.ts) — revalidate keeps it
// fresh during a live game without hitting ESPN on every single request.
export const revalidate = 120;

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ league: string; id: string }>;
}) {
  const { league, id } = await params;
  if (!isLeague(league)) notFound();

  const game = await getGameByEspnId(league, id);
  if (!game) notFound();

  const summary = await fetchMatchSummary(league, id);

  const teamStats = summary ? parseTeamStats(summary) : [];
  const playerBox =
    summary && league !== "ipl" ? (league === "epl" ? parseSoccerPlayerBox(summary) : parseAmericanPlayerBox(summary)) : [];
  const cricketScorecard = summary && league === "ipl" ? parseCricketScorecard(summary) : [];

  const athleteIds = new Set<string>();
  for (const team of playerBox) for (const cat of team.categories) for (const row of cat.rows) athleteIds.add(row.athleteId);
  for (const team of cricketScorecard) {
    for (const row of team.battingRows) athleteIds.add(row.athleteId);
    for (const row of team.bowlingRows) athleteIds.add(row.athleteId);
  }
  const playerSlugs = await getPlayerSlugsByEspnIds(league, [...athleteIds]);

  const [awayStats, homeStats] = teamStats;

  return (
    <div className="flex flex-col gap-6">
      <MatchHeader game={game} />

      <AdSlot label="Match detail top" />

      {!summary && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Match details aren&apos;t available right now.</p>}

      {awayStats && homeStats && (
        <section>
          <SectionHeader>Team Stats</SectionHeader>
          <TeamStatsComparison away={awayStats} home={homeStats} />
        </section>
      )}

      {league === "ipl" && cricketScorecard.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader>Scorecard</SectionHeader>
          {cricketScorecard.map((team) => (
            <CricketScorecard key={team.teamId} league={league} team={team} playerSlugs={playerSlugs} />
          ))}
        </section>
      )}

      {league !== "ipl" && playerBox.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader>Player Stats</SectionHeader>
          {playerBox.map((team) => (
            <PlayerBoxScoreTable key={team.teamId} league={league} team={team} playerSlugs={playerSlugs} />
          ))}
        </section>
      )}
    </div>
  );
}
