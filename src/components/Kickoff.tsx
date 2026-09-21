import { LocalTime } from "./LocalTime";
import { dayTimeZone, formatGameDate } from "@/lib/gameDay";
import { isTimeTbd } from "@/lib/gameStatus";
import type { League } from "@/lib/leagues";
import type { LocalTimeFormat } from "@/lib/localTime";

/**
 * A fixture's kickoff: the visitor's local time (see LocalTime), or, for a game whose time the feed has not set
 * (NFL week 18 is filed at a placeholder 05:00 UTC), the day in the league's own zone plus "TBD". The day is
 * plain text rather than a LocalTime, which would move it to the visitor's zone and could show the day before.
 */
export function Kickoff({
  league,
  game,
  format,
  className = "",
}: {
  league: League;
  game: { date: string; completed: boolean; status_state: string | null; status_detail: string | null };
  format: LocalTimeFormat;
  className?: string;
}) {
  if (isTimeTbd(game)) {
    const day = formatGameDate(game.date, league, { weekday: "short", month: "short", day: "numeric" });
    return <span className={className}>{format === "time" ? "TBD" : format === "date" ? day : `${day} · TBD`}</span>;
  }
  return <LocalTime iso={game.date} format={format} className={className} league={league} serverTimeZone={dayTimeZone(league)} />;
}
