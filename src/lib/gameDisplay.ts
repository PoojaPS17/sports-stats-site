// Text and state a game's visitor-facing displays share. A game ESPN closed without playing is stored as not
// completed with a called-off status; it must never read as a fixture still to come, so every "upcoming" test and
// kickoff time goes through here.
import type { GameRow } from "./queries";
import { gameCalledOffLabel, isGameCalledOff } from "./gameStatus";
import { teamDisplayName } from "./teamName";
import { finishedLabel, normalizeStage } from "./stage";
import type { League } from "./leagues";

type StatusFields = Pick<GameRow, "completed" | "status_state" | "status_detail">;

/** A game still to be played: not finished, not in play, and not called off. */
export const isUpcomingGame = (g: StatusFields): boolean => !g.completed && g.status_state !== "in" && !isGameCalledOff(g);

/** The date line of a schedule row: date and kickoff for an upcoming game, date and reason for a called-off one, date alone otherwise. */
export function scheduleRowHeading(g: StatusFields & Pick<GameRow, "date">): string {
  const d = new Date(g.date);
  const when = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const off = gameCalledOffLabel(g);
  if (off) return `${when} · ${off}`;
  if (isUpcomingGame(g)) return `${when} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return when;
}

/** Screen-reader name of a game card. */
export function gameAccessibleLabel(
  game: StatusFields & Pick<GameRow, "date" | "round" | "home_name" | "away_name" | "home_score" | "away_score" | "home_score_display" | "away_score_display">,
): string {
  if (game.completed) {
    return `${teamDisplayName(game.away_name)} ${game.away_score_display ?? game.away_score ?? ""}, ${teamDisplayName(game.home_name)} ${
      game.home_score_display ?? game.home_score ?? ""
    }, ${game.round ?? "final"}`;
  }
  const date = new Date(game.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const label = `${teamDisplayName(game.away_name)} at ${teamDisplayName(game.home_name)}, ${date}`;
  const off = gameCalledOffLabel(game);
  return off ? `${label}, ${off.toLowerCase()}` : label;
}

/** The status line of one tile on a scoreboard image: result, live detail, kickoff (UTC), or why a called-off game is off. */
export function scoreboardTileStatus(league: League, g: StatusFields & Pick<GameRow, "date" | "round">, withDate: boolean): string {
  const off = gameCalledOffLabel(g);
  const live = g.status_state === "in" && !g.completed;
  if (withDate) {
    const day = new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return `${day} · ${g.completed ? (normalizeStage(g.round) ?? finishedLabel(league)) : live ? (g.status_detail ?? "Live") : (off ?? "Upcoming")}`;
  }
  if (g.completed) return normalizeStage(g.round) ?? finishedLabel(league);
  if (off) return off;
  if (live) return g.status_detail ?? "Live";
  return `${new Date(g.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

/**
 * How a finished match that has no scores ended ("Match abandoned without a ball bowled", "No result"): the
 * result text ESPN gives, for the share image to show in place of "vs". It is a result, never a called-off label.
 */
export function finishedNoScoreNote(g: Pick<GameRow, "completed" | "home_score" | "away_score" | "status_summary">): string | null {
  if (!g.completed || (g.home_score != null && g.away_score != null)) return null;
  return g.status_summary?.trim() || null;
}
