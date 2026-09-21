import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportTeamLine } from "./ExportTeamLine";
import { ExportFooter } from "./ExportFooter";
import { ExportMore, capRows } from "./ExportShell";
import { LEAGUE_LABEL, type GameRow, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";
import { scheduleRowHeading } from "@/lib/gameDisplay";

function ScheduleRow({ league, game }: { league: League; game: GameRow }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);

  return (
    <div style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: CARD.textFaint }}>
        {scheduleRowHeading(league, game)}
      </div>
      <ExportTeamLine name={game.away_name} logo={game.away_logo} color={game.away_color} score={game.away_score} scoreDisplay={game.away_score_display} completed={game.completed} won={awayWon} />
      <ExportTeamLine name={game.home_name} logo={game.home_logo} color={game.home_color} score={game.home_score} scoreDisplay={game.home_score_display} completed={game.completed} won={homeWon} />
    </div>
  );
}

// The downloadable version of "Results & Schedule": every game of one season for one
// team, laid out as a fixed-width grid. Past 25 games it stops and says how many more
// there are, so an 82-game season stays a shareable picture rather than a poster.
export function TeamScheduleExportCard({
  league,
  teamName,
  teamLogo,
  teamColor,
  seasonLabel,
  games,
}: {
  league: League;
  teamName: string;
  teamLogo: string | null;
  teamColor: string | null;
  seasonLabel: string;
  games: GameRow[];
}) {
  const { shown, hidden } = capRows(games);
  return (
    <div style={{ background: CARD.surface, border: `1px solid ${CARD.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", height: 52, width: 52, alignItems: "center", justifyContent: "center", borderRadius: 10, background: CARD.bg, flexShrink: 0 }}>
          <TeamLogo name={teamName} logoUrl={teamLogo} color={teamColor} size={36} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>
            {LEAGUE_LABEL[league]} · {seasonLabel}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: CARD.text, lineHeight: 1.15 }}>{teamDisplayName(teamName)} results &amp; schedule</div>
        </div>
      </div>
      {games.length === 0 ? (
        <p style={{ marginTop: 16, fontSize: 14, color: CARD.textMuted }}>No games found for this season.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
            {shown.map((g) => (
              <ScheduleRow key={g.espn_id} league={league} game={g} />
            ))}
          </div>
          <ExportMore boxed count={hidden} noun={hidden === 1 ? "more game" : "more games"} />
        </>
      )}
      <ExportFooter context={`${teamDisplayName(teamName)} ${seasonLabel}`} />
    </div>
  );
}
