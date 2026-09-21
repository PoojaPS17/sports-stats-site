import { ExportTeamLine } from "./ExportTeamLine";
import { LEAGUE_LABEL, type GameRow, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";
import { gameCalledOffLabel } from "@/lib/gameStatus";
import { formatGameDateRange } from "@/lib/gameDay";
import { finishedPillLabel } from "@/lib/stage";
import { scoreLineSides } from "@/lib/gamePage";
import type { CricketTeamScorecard } from "@/lib/matchDetail";

// The top of every match-section image: league, date and the scoreline, so a stats
// table pasted into a group chat still says who played and how it ended.
export function MatchScoreHeader({ league, game, scorecard }: { league: League; game: GameRow; scorecard?: CricketTeamScorecard[] | null }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const showScore = game.completed || game.status_state === "in";
  const when = formatGameDateRange(game.date, league, game.local_date, game.end_date);
  // finishedPillLabel covers both streams' rules at once: the game's stage when it has one ("Final" only for a real
  // final, so a cricket match says its stage), "Final/OT" after overtime, and otherwise the league's own finished
  // word -- "Result" for cricket, "FT" for football, "Final" for the US sports.
  const finished = finishedPillLabel(league, game);
  const lines = {
    away: (
      <ExportTeamLine name={game.away_name} logo={game.away_logo} color={game.away_color} score={game.away_score} scoreDisplay={game.away_score_display} completed={game.completed} won={awayWon} showScore={showScore} />
    ),
    home: (
      <ExportTeamLine name={game.home_name} logo={game.home_logo} color={game.home_color} score={game.home_score} scoreDisplay={game.home_score_display} completed={game.completed} won={homeWon} showScore={showScore} />
    ),
  };
  // Cricket lists the side that batted first first; football the home side; the NBA and NFL the visitors.
  const order = scoreLineSides(league, game, scorecard);
  // A postponed or cancelled game says so instead of showing a bare date that reads as a fixture.
  const off = gameCalledOffLabel(game);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>
        <span>{LEAGUE_LABEL[league]}</span>
        <span>{off ? `${off} · ${when}` : game.completed ? `${finished} · ${when}` : game.status_state === "in" ? `Live · ${when}` : when}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {lines[order[0]]}
        {lines[order[1]]}
      </div>
      {game.completed && !off && game.status_summary && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: CARD.accent }}>{game.status_summary}</div>}
    </div>
  );
}
