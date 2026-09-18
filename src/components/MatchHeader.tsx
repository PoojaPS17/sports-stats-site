import Link from "next/link";
import { TeamLogo } from "./TeamLogo";
import { StatusPill } from "./StatusPill";
import type { GameRow, League } from "@/lib/queries";
import { finishedLabel } from "@/lib/stage";

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
        <TeamLogo name={name} logoUrl={logo} color={color} size={40} />
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

  return (
    <div className="card overflow-hidden px-6 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <StatusPill statusState={game.status_state} statusDetail={game.status_detail} date={game.date} completed={game.completed} round={game.round} completedLabel={finishedLabel(league)} />
        <span className="text-xs text-[var(--text-muted)]">
          {new Date(game.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <TeamLine
          href={`/${league}/teams/${game.away_slug}`}
          name={game.away_name}
          logo={game.away_logo}
          color={game.away_color}
          score={game.away_score}
          scoreDisplay={game.away_score_display}
          completed={game.completed}
          won={awayWon}
        />
        <TeamLine
          href={`/${league}/teams/${game.home_slug}`}
          name={game.home_name}
          logo={game.home_logo}
          color={game.home_color}
          score={game.home_score}
          scoreDisplay={game.home_score_display}
          completed={game.completed}
          won={homeWon}
        />
      </div>
      {game.completed && game.status_summary && (
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm font-medium text-[var(--accent)]">{game.status_summary}</p>
      )}
    </div>
  );
}
