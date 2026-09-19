import { ExportTeamLine } from "./ExportTeamLine";
import { ExportShell, ExportTitle, ExportMore, capRows } from "./ExportShell";
import { isCricketLeague, type GameRow, type League } from "@/lib/queries";
import { finishedLabel, normalizeStage } from "@/lib/stage";
import { teamDisplayName } from "@/lib/teamName";
import { CARD } from "@/lib/exportTheme";

/** One column for cricket, whose scores are long ("161/5 (18/20 ov)"), two for everything else. */
export function scoreboardExportWidth(league: League): number {
  return isCricketLeague(league) ? 640 : 820;
}

function status(league: League, g: GameRow, withDate: boolean): string {
  const day = new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (withDate) return `${day} · ${g.completed ? (normalizeStage(g.round) ?? finishedLabel(league)) : "Upcoming"}`;
  if (g.completed) return normalizeStage(g.round) ?? finishedLabel(league);
  if (g.status_state === "in") return g.status_detail ?? "Live";
  return `${new Date(g.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

function Tile({ league, game, withDate }: { league: League; game: GameRow; withDate: boolean }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const showScore = game.completed || game.status_state === "in";
  return (
    <div style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: game.status_state === "in" ? CARD.loss : CARD.textFaint }}>{status(league, game, withDate)}</div>
      <ExportTeamLine name={game.away_name} logo={game.away_logo} color={game.away_color} score={game.away_score} scoreDisplay={game.away_score_display} completed={game.completed} won={awayWon} showScore={showScore} />
      <ExportTeamLine name={game.home_name} logo={game.home_logo} color={game.home_color} score={game.home_score} scoreDisplay={game.home_score_display} completed={game.completed} won={homeWon} showScore={showScore} />
      {game.completed && game.status_summary && <div style={{ fontSize: 12, fontWeight: 600, color: CARD.textMuted }}>{teamDisplayName(game.status_summary)}</div>}
    </div>
  );
}

// A day's scores or fixtures as one picture: a tile per game with both sides, the score
// and the result line. Stops at 25 games and says how many more the day held.
export function ScoreboardExportCard({ league, title, subtitle, games, withDate = false }: { league: League; title: string; subtitle?: string | null; games: GameRow[]; /** Put each game's date on its tile, for lists that span days (head-to-head meetings). */ withDate?: boolean }) {
  const { shown, hidden } = capRows(games);
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: isCricketLeague(league) ? "1fr" : "1fr 1fr", gap: 10 }}>
        {shown.map((g) => (
          <Tile key={g.espn_id} league={league} game={g} withDate={withDate} />
        ))}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more game" : "more games"} />
    </ExportShell>
  );
}
