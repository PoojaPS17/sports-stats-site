import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import type { GameRow, League } from "@/lib/queries";
import { TeamLogo } from "./TeamLogo";
import { StatusPill } from "./StatusPill";
import { LocalTime } from "./LocalTime";
import { finishedLabel } from "@/lib/stage";
import { dayTimeZone, formatGameDate } from "@/lib/gameDay";
import { gameAccessibleLabel, isUpcomingGame } from "@/lib/gameDisplay";
import { scoreLineOrder } from "@/lib/cricketOrder";

function TeamRow({
  name,
  abbr,
  logo,
  color,
  score,
  scoreDisplay,
  completed,
  live = false,
  won,
}: {
  name: string;
  abbr: string | null;
  logo: string | null;
  color: string | null;
  score: number | null;
  scoreDisplay: string | null;
  completed: boolean;
  live?: boolean;
  won: boolean;
}) {
  // A plain integer score ("119") sits fine on the same line as the team name. A long
  // compound score (cricket's "161/5 (18/20 ov, target 156)") was forcing the name to
  // truncate to a couple of letters to make room — give it its own line instead.
  const isLongScore = Boolean(scoreDisplay);
  const loser = completed && !won;
  // A game in play shows its running score too.
  const showScore = completed || live;

  return (
    <div className="flex flex-col gap-0.5 py-1">
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <TeamLogo name={name} logoUrl={logo} color={color} size={26} />
          <span className={`truncate text-[15px] ${loser ? "font-medium text-[var(--text-muted)]" : "font-semibold text-[var(--text)]"}`}>
            <span className="sm:hidden">{abbr ?? name}</span>
            <span className="hidden sm:inline">{name}</span>
          </span>
        </span>
        {showScore && !isLongScore && score !== null && (
          <span className={`shrink-0 text-base tabular-nums ${won ? "font-bold text-[var(--text)]" : "font-medium text-[var(--text-muted)]"}`}>
            {score}
          </span>
        )}
      </span>
      {showScore && isLongScore && (
        <span className={`pl-[36px] text-xs tabular-nums ${won ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {scoreDisplay}
        </span>
      )}
    </div>
  );
}

export function GameCard({ league, game }: { league: League; game: GameRow }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const live = game.status_state === "in";
  // A called-off game is not upcoming: it has no kickoff time to show.
  const upcoming = isUpcomingGame(game);

  // Cricinfo lists the side that batted first first; every other sport keeps away-then-home.
  const order = scoreLineOrder(game);
  const rows = {
    away: (
      <TeamRow
        name={teamDisplayName(game.away_name)}
        abbr={game.away_abbr}
        logo={game.away_logo}
        color={game.away_color}
        score={game.away_score}
        scoreDisplay={game.away_score_display}
        completed={game.completed}
        live={live}
        won={awayWon}
      />
    ),
    home: (
      <TeamRow
        name={teamDisplayName(game.home_name)}
        abbr={game.home_abbr}
        logo={game.home_logo}
        color={game.home_color}
        score={game.home_score}
        scoreDisplay={game.home_score_display}
        completed={game.completed}
        live={live}
        won={homeWon}
      />
    ),
  };

  return (
    <Link
      href={`/${league}/games/${game.espn_id}`}
      aria-label={gameAccessibleLabel(league, game)}
      className={`card block px-4 py-3 ${live ? "border-[var(--live)]/40" : ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <StatusPill
          statusState={game.status_state}
          statusDetail={game.status_detail}
          date={game.date}
          completed={game.completed}
          round={game.round}
          completedLabel={finishedLabel(league)}
          serverTimeZone={dayTimeZone(league)}
        />
        {upcoming ? (
          <LocalTime iso={game.date} format="time" className="text-xs font-medium text-[var(--text-muted)]" serverTimeZone={dayTimeZone(league)} />
        ) : live && game.status_detail ? (
          <span className="text-xs font-medium text-[var(--text-muted)]">{teamDisplayName(game.status_detail)}</span>
        ) : (
          <span className="text-xs text-[var(--text-faint)]">
            {formatGameDate(game.date, league, { month: "short", day: "numeric" }, game.local_date)}
          </span>
        )}
      </div>
      {rows[order[0]]}
      {rows[order[1]]}
      {game.completed && game.status_summary && (
        <p className="mt-1.5 border-t border-[var(--border)] pt-1.5 text-xs font-medium text-[var(--text-muted)]">{teamDisplayName(game.status_summary)}</p>
      )}
    </Link>
  );
}
