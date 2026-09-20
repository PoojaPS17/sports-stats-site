import { ExportTeamLine } from "./ExportTeamLine";
import { LEAGUE_LABEL, type GameRow, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";
import { calledOffLabel, isGameCalledOff } from "@/lib/gameStatus";

// The top of every match-section image: league, date and the scoreline, so a stats
// table pasted into a group chat still says who played and how it ended.
export function MatchScoreHeader({ league, game }: { league: League; game: GameRow }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const showScore = game.completed || game.status_state === "in";
  const when = new Date(game.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  // A postponed or cancelled game says so instead of showing a bare date that reads as a fixture.
  const off = isGameCalledOff(game) ? calledOffLabel(game.status_detail) : null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>
        <span>{LEAGUE_LABEL[league]}</span>
        <span>{game.completed ? `Final · ${when}` : game.status_state === "in" ? `Live · ${when}` : off ? `${off} · ${when}` : when}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <ExportTeamLine name={game.away_name} logo={game.away_logo} color={game.away_color} score={game.away_score} scoreDisplay={game.away_score_display} completed={game.completed} won={awayWon} showScore={showScore} />
        <ExportTeamLine name={game.home_name} logo={game.home_logo} color={game.home_color} score={game.home_score} scoreDisplay={game.home_score_display} completed={game.completed} won={homeWon} showScore={showScore} />
      </div>
      {game.completed && game.status_summary && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: CARD.accent }}>{game.status_summary}</div>}
    </div>
  );
}
