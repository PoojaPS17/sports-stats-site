import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { StatusPill } from "./StatusPill";
import { FollowButton } from "./FollowButton";
import { LEAGUE_LABEL, type GameRow, type League } from "@/lib/queries";
import { finishedLabel } from "@/lib/stage";
import { dayTimeZone, formatGameDateRange } from "@/lib/gameDay";
import { scoreLineOrder } from "@/lib/cricketOrder";
import type { CricketTeamScorecard } from "@/lib/matchDetail";

function TeamLine({
  href,
  name,
  logo,
  color,
  score,
  scoreDisplay,
  completed,
  won,
}: {
  href: string;
  name: string;
  logo: string | null;
  color: string | null;
  score: number | null;
  scoreDisplay: string | null;
  completed: boolean;
  won: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link href={href} className="flex min-w-0 items-center gap-3 hover:text-[var(--accent)]">
        <TeamLogo name={name} logoUrl={logo} color={color} size={40} priority />
        <span className={`truncate text-lg ${completed && won ? "font-extrabold" : "font-semibold"}`}>{name}</span>
      </Link>
      {completed && (score !== null || scoreDisplay) && (
        <span className={`shrink-0 tabular-nums ${won ? "text-xl font-extrabold text-[var(--text)]" : "text-lg text-[var(--text-muted)]"}`}>
          {scoreDisplay ?? score}
        </span>
      )}
    </div>
  );
}

/**
 * `scorecard` is the stored cricket scorecard, when the page has one: it says which side batted first,
 * and Cricinfo lists that side first. Without it the order is away then home, as for every other sport.
 */
export function MatchHeader({ league, game, scorecard }: { league: League; game: GameRow; scorecard?: CricketTeamScorecard[] | null }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const matchLabel = `${teamDisplayName(game.away_name)} vs ${teamDisplayName(game.home_name)}`;
  const path = `/${league}/games/${game.espn_id}`;
  const rows = {
    away: (
      <TeamLine
        href={`/${league}/teams/${game.away_slug}`}
        name={teamDisplayName(game.away_name)}
        logo={game.away_logo}
        color={game.away_color}
        score={game.away_score}
        scoreDisplay={game.away_score_display}
        completed={game.completed}
        won={awayWon}
      />
    ),
    home: (
      <TeamLine
        href={`/${league}/teams/${game.home_slug}`}
        name={teamDisplayName(game.home_name)}
        logo={game.home_logo}
        color={game.home_color}
        score={game.home_score}
        scoreDisplay={game.home_score_display}
        completed={game.completed}
        won={homeWon}
      />
    ),
  };
  const order = scoreLineOrder(game, scorecard);

  return (
    <div className="card overflow-hidden px-6 py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <StatusPill statusState={game.status_state} statusDetail={game.status_detail} date={game.date} completed={game.completed} round={game.round} completedLabel={finishedLabel(league)} serverTimeZone={dayTimeZone(league)} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            {formatGameDateRange(game.date, league, game.local_date, game.end_date)}
          </span>
          <FollowButton item={{ kind: "game", league, refId: game.espn_id, label: matchLabel, sublabel: LEAGUE_LABEL[league], href: path }} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {rows[order[0]]}
        {rows[order[1]]}
      </div>
      {game.completed && game.status_summary && (
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm font-medium text-[var(--accent)]">{game.status_summary}</p>
      )}
    </div>
  );
}
