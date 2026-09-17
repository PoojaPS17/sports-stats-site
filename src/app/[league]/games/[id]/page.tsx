import { notFound } from "next/navigation";
import { isLeague, isCricketLeague, getGameByEspnId, getPlayerSlugsByEspnIds } from "@/lib/queries";
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
import { ViewTracker } from "@/components/ViewTracker";

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

  const isCricket = isCricketLeague(league);
  const teamStats = summary ? parseTeamStats(summary) : [];
  const playerBox =
    summary && !isCricket
      ? league === "epl" || league === "laliga"
        ? parseSoccerPlayerBox(summary)
        : parseAmericanPlayerBox(summary)
      : [];
  const cricketScorecard = summary && isCricket ? parseCricketScorecard(summary) : [];
  // Soccer's box score source (rosters[]) always has one entry per team, even before
  // kickoff — it's just the squad list, so categories comes back empty rather than the
  // array itself. playerBox.length alone can't tell "no stats yet" from "has stats".
  const hasPlayerStats = playerBox.some((team) => team.categories.length > 0);

  const athleteIds = new Set<string>();
  for (const team of playerBox) for (const cat of team.categories) for (const row of cat.rows) athleteIds.add(row.athleteId);
  for (const team of cricketScorecard) {
    for (const row of team.battingRows) athleteIds.add(row.athleteId);
    for (const row of team.bowlingRows) athleteIds.add(row.athleteId);
  }
  const playerSlugs = await getPlayerSlugsByEspnIds(league, [...athleteIds]);

  const [awayStats, homeStats] = teamStats;
  // Before a game starts, ESPN's "boxscore" is actually each team's season-to-date
  // per-game averages (entering the matchup) — there's no real box score yet since
  // nothing's been played. Labeling that "Team Stats" the same way a completed game's
  // real box score is labeled reads as if these numbers are from this game, which
  // they aren't — so call it out explicitly instead of leaving it ambiguous.
  const notYetStarted = game.status_state === "pre";

  return (
    <div className="flex flex-col gap-6">
      <ViewTracker league={league} gameId={id} />
      <MatchHeader game={game} />

      <AdSlot label="Match detail top" />

      {!summary && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Match details aren&apos;t available right now.</p>}

      {awayStats && homeStats && (
        <section>
          <SectionHeader>{notYetStarted ? "Season Comparison" : "Team Stats"}</SectionHeader>
          {notYetStarted && (
            <p className="-mt-2 mb-3 text-xs text-[var(--text-muted)]">
              Season averages entering this matchup — the game hasn&apos;t been played yet.
            </p>
          )}
          <TeamStatsComparison away={awayStats} home={homeStats} />
        </section>
      )}

      {isCricket && cricketScorecard.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader>Scorecard</SectionHeader>
          {cricketScorecard.map((team) => (
            <CricketScorecard key={team.teamId} league={league} team={team} playerSlugs={playerSlugs} />
          ))}
        </section>
      )}

      {!isCricket && hasPlayerStats && (
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
