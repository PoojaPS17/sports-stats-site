import { LocalTime } from "./LocalTime";
import { dayTimeZone, formatGameDate, gameDayIso } from "@/lib/gameDay";
import { isTimeTbd } from "@/lib/gameStatus";
import { isSoccerLeague, type League } from "@/lib/leagues";
import type { LocalTimeFormat } from "@/lib/localTime";

/**
 * A fixture's kickoff: the day the league files it under, and the visitor's local time (see LocalTime). The day is
 * passed to LocalTime as `day`, so it never moves to the visitor's zone and always matches the day heading above the
 * card; the clock names its own weekday when the visitor's day differs ("Sun 4:30 AM" for a Saturday NBA game seen
 * from India). A cricket match passes its stored local date, the day Cricinfo files it under. For a game whose time
 * the feed has not set (NFL week 18 is filed at a placeholder 05:00 UTC), the day plus "TBD" as plain text.
 */
export function Kickoff({
  league,
  game,
  format,
  className = "",
}: {
  league: League;
  game: { date: string; completed: boolean; status_state: string | null; status_detail: string | null; local_date?: string | null };
  format: LocalTimeFormat;
  className?: string;
}) {
  if (isTimeTbd(game, league)) {
    const day = formatGameDate(game.date, league, { weekday: "short", month: "short", day: "numeric" }, game.local_date);
    return <span className={className}>{format === "time" ? "TBD" : format === "date" ? day : `${day} · TBD`}</span>;
  }
  return (
    <LocalTime
      iso={game.date}
      format={format}
      className={className}
      league={league}
      serverTimeZone={dayTimeZone(league)}
      day={gameDayIso(game.date, league, game.local_date)}
      // Football's 24-hour clock names its zone already; everything else names it here, as tennis does.
      showZone={!isSoccerLeague(league)}
    />
  );
}
