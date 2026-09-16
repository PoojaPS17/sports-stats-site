import Link from "next/link";
import type { GameRow, League } from "@/lib/queries";
import { TeamLogo } from "./TeamLogo";
import { StatusPill } from "./StatusPill";

function TeamRow({
  league,
  name,
  slug,
  abbr,
  logo,
  color,
  score,
  scoreDisplay,
  completed,
  won,
}: {
  league: League;
  name: string;
  slug: string;
  abbr: string | null;
  logo: string | null;
  color: string | null;
  score: number | null;
  scoreDisplay: string | null;
  completed: boolean;
  won: boolean;
}) {
  // A plain integer score ("119") sits fine on the same line as the team name. A long
  // compound score (cricket's "161/5 (18/20 ov, target 156)") was forcing the name to
  // truncate to a couple of letters to make room — give it its own line instead.
  const isLongScore = Boolean(scoreDisplay);

  return (
    <Link href={`/${league}/teams/${slug}`} className="flex flex-col gap-0.5 py-1.5 hover:opacity-80">
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <TeamLogo name={name} logoUrl={logo} color={color} size={28} />
          <span className={`truncate text-sm ${completed && won ? "font-semibold" : "font-medium"}`}>
            <span className="sm:hidden">{abbr ?? name}</span>
            <span className="hidden sm:inline">{name}</span>
          </span>
        </span>
        {completed && !isLongScore && score !== null && (
          <span className={`shrink-0 tabular-nums ${won ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{score}</span>
        )}
      </span>
      {completed && isLongScore && (
        <span className={`pl-[38px] text-xs tabular-nums ${won ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {scoreDisplay}
        </span>
      )}
    </Link>
  );
}

export function GameCard({ league, game }: { league: League; game: GameRow }) {
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);

  return (
    <div className="card group relative overflow-hidden px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${game.away_color ?? "var(--border)"}, ${game.home_color ?? "var(--border)"})`,
        }}
      />
      <div className="mb-1.5 flex items-center justify-between">
        <StatusPill
          statusState={game.status_state}
          statusDetail={game.status_detail}
          date={game.date}
          completed={game.completed}
        />
      </div>
      <TeamRow
        league={league}
        name={game.away_name}
        slug={game.away_slug}
        abbr={game.away_abbr}
        logo={game.away_logo}
        color={game.away_color}
        score={game.away_score}
        scoreDisplay={game.away_score_display}
        completed={game.completed}
        won={awayWon}
      />
      <TeamRow
        league={league}
        name={game.home_name}
        slug={game.home_slug}
        abbr={game.home_abbr}
        logo={game.home_logo}
        color={game.home_color}
        score={game.home_score}
        scoreDisplay={game.home_score_display}
        completed={game.completed}
        won={homeWon}
      />
      {game.completed && game.status_summary && (
        <p className="mt-1.5 border-t border-[var(--border)] pt-1.5 text-xs font-medium text-[var(--accent)]">{game.status_summary}</p>
      )}
    </div>
  );
}
