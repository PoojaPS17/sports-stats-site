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
  completed: boolean;
  won: boolean;
}) {
  return (
    <Link
      href={`/${league}/teams/${slug}`}
      className="flex items-center justify-between gap-3 py-1.5 hover:opacity-80"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <TeamLogo name={name} logoUrl={logo} color={color} size={28} />
        <span className={`truncate text-sm ${completed && won ? "font-semibold" : "font-medium"}`}>
          <span className="sm:hidden">{abbr ?? name}</span>
          <span className="hidden sm:inline">{name}</span>
        </span>
      </span>
      {completed && (
        <span className={`tabular-nums ${won ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
          {score}
        </span>
      )}
    </Link>
  );
}

export function GameCard({ league, game }: { league: League; game: GameRow }) {
  const homeWon = (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = (game.away_score ?? 0) > (game.home_score ?? 0);

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
        completed={game.completed}
        won={homeWon}
      />
    </div>
  );
}
