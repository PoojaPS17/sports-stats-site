import Link from "next/link";
import { TeamLogo } from "./TeamLogo";
import { teamDisplayName } from "@/lib/teamName";
import { gameRoundLabel } from "@/lib/stage";
import { formatGameDate } from "@/lib/gameDay";
import { notPlayedText, type NotNeeded } from "@/lib/playoffSeries";
import { LEAGUE_LABEL, type GameRow, type League } from "@/lib/queries";

/**
 * The page of a game its series no longer needs ("ALDS - Game 4 If Necessary" after a sweep): it exists in the feed
 * and never will be played, so it says so, and names the series result, instead of presenting a fixture.
 */
export function NotPlayedGame({ league, game, notNeeded }: { league: League; game: GameRow; notNeeded: NotNeeded }) {
  const winnerIsHome = notNeeded.winner === game.home_team_espn_id;
  const winner = { name: winnerIsHome ? game.home_name : game.away_name, slug: winnerIsHome ? game.home_slug : game.away_slug };
  const loserName = winnerIsHome ? game.away_name : game.home_name;
  const round = gameRoundLabel(game);
  const day = formatGameDate(game.date, league, { month: "long", day: "numeric", year: "numeric" }, game.local_date);
  const side = (name: string, logo: string | null, color: string | null) => (
    <div className="flex items-center gap-3">
      <TeamLogo name={name} logoUrl={logo} color={color} size={40} priority />
      <span className="text-lg font-semibold">{teamDisplayName(name)}</span>
    </div>
  );
  return (
    <div className="card overflow-hidden px-6 py-5" data-testid="not-played">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="pill pill-final">Not played</span>
        <span className="text-xs text-[var(--text-muted)]">
          {LEAGUE_LABEL[league]}
          {round ? ` · ${round}` : ""}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {side(game.away_name, game.away_logo, game.away_color)}
        {side(game.home_name, game.home_logo, game.home_color)}
      </div>
      <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm font-medium text-[var(--accent)]">{notPlayedText(notNeeded)}</p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        This game was on the schedule for {day} in case the series went the distance.{" "}
        <Link href={`/${league}/teams/${winner.slug}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">
          {teamDisplayName(winner.name)}
        </Link>{" "}
        beat {teamDisplayName(loserName)} {notNeeded.score}, so it was never played.
      </p>
    </div>
  );
}
