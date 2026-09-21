import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { StatusPill } from "./StatusPill";
import { FollowButton } from "./FollowButton";
import { LEAGUE_LABEL, type GameRow, type League } from "@/lib/queries";
import { formatGameDate } from "@/lib/gameDay";
import { scoreLineHomeFirst } from "@/lib/gamePage";
import { isUpcomingGame } from "@/lib/gameDisplay";

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

export function MatchHeader({ league, game }: { league: League; game: GameRow }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const homeFirst = scoreLineHomeFirst(league);
  // The page title names football's home side first ("Manchester City vs Sunderland"), so the follow label and the score lines do too.
  const matchLabel = homeFirst ? `${teamDisplayName(game.home_name)} vs ${teamDisplayName(game.away_name)}` : `${teamDisplayName(game.away_name)} vs ${teamDisplayName(game.home_name)}`;
  const path = `/${league}/games/${game.espn_id}`;
  const away = { slug: game.away_slug, name: game.away_name, logo: game.away_logo, color: game.away_color, score: game.away_score, scoreDisplay: game.away_score_display, won: awayWon };
  const home = { slug: game.home_slug, name: game.home_name, logo: game.home_logo, color: game.home_color, score: game.home_score, scoreDisplay: game.home_score_display, won: homeWon };
  const sides = homeFirst ? [home, away] : [away, home];

  return (
    <div className="card overflow-hidden px-6 py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <StatusPill statusState={game.status_state} statusDetail={game.status_detail} date={game.date} completed={game.completed} round={game.round} stage={game.stage} competitionType={game.competition_type} note={game.note} league={league} kickoff="datetime" />
        <div className="flex items-center gap-3">
          {/* An upcoming match's pill already carries its date and kickoff time; print the date once. */}
          {!isUpcomingGame(game) && (
            <span className="text-xs text-[var(--text-muted)]">
              {formatGameDate(game.date, league, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
          <FollowButton item={{ kind: "game", league, refId: game.espn_id, label: matchLabel, sublabel: LEAGUE_LABEL[league], href: path }} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {sides.map((t) => (
          <TeamLine key={t.slug} href={`/${league}/teams/${t.slug}`} name={teamDisplayName(t.name)} logo={t.logo} color={t.color} score={t.score} scoreDisplay={t.scoreDisplay} completed={game.completed} won={t.won} />
        ))}
      </div>
      {game.completed && game.status_summary && (
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm font-medium text-[var(--accent)]">{game.status_summary}</p>
      )}
    </div>
  );
}
