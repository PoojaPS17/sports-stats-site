import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { isCalledOff } from "@/lib/gameStatus";
import type { GameRow, League } from "@/lib/queries";
import { LEAGUE_LABEL } from "@/lib/leagues";
import { TeamLogo } from "./TeamLogo";
import { StatusPill } from "./StatusPill";
import { Kickoff } from "./Kickoff";
import { scoreLineHomeFirst } from "@/lib/gamePage";

// The one game worth leading the homepage with: live if anything is on, else the
// next big kickoff, else the biggest recent result.
export function pickSpotlight(games: GameRow[]): GameRow | null {
  const live = games.find((g) => g.status_state === "in");
  if (live) return live;
  // `date` arrives as a Date object from pg despite the string type, so compare by time.
  const now = Date.now();
  const at = (g: GameRow) => new Date(g.date).getTime();
  // A postponed or cancelled game with a future date is not a fixture.
  const upcoming = games.filter((g) => !g.completed && !isCalledOff(g.status_detail) && at(g) > now).sort((a, b) => at(a) - at(b))[0];
  if (upcoming && at(upcoming) - now < 36 * 3600 * 1000) return upcoming;
  const recent = games.filter((g) => g.completed).sort((a, b) => at(b) - at(a))[0];
  return recent ?? upcoming ?? null;
}

function Team({ name, logo, color, score, scoreDisplay, completed, won }: { name: string; logo: string | null; color: string | null; score: number | null; scoreDisplay: string | null; completed: boolean; won: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <TeamLogo name={name} logoUrl={logo} color={color} size={40} />
        <span className="min-w-0">
          <span className={`block truncate text-lg ${completed && !won ? "font-medium text-[var(--text-muted)]" : "font-bold text-[var(--text)]"}`}>{name}</span>
          {completed && scoreDisplay && <span className="block text-xs tabular-nums text-[var(--text-muted)]">{scoreDisplay}</span>}
        </span>
      </span>
      {completed && !scoreDisplay && score !== null && (
        <span className={`shrink-0 text-2xl tabular-nums ${won ? "font-bold text-[var(--text)]" : "font-medium text-[var(--text-muted)]"}`}>{score}</span>
      )}
    </div>
  );
}

export function SpotlightCard({ game }: { game: GameRow }) {
  const league = game.league as League;
  const live = game.status_state === "in";
  const label = live ? "Live now" : game.completed ? "Latest result" : "Coming up";
  const homeWon = game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0);
  const away = { side: "away", name: game.away_name, logo: game.away_logo, color: game.away_color, score: game.away_score, scoreDisplay: game.away_score_display, won: awayWon };
  const home = { side: "home", name: game.home_name, logo: game.home_logo, color: game.home_color, score: game.home_score, scoreDisplay: game.home_score_display, won: homeWon };
  // Football lists the home side first; the NBA and NFL list the visitors first.
  const sides = scoreLineHomeFirst(league) ? [home, away] : [away, home];

  return (
    <Link href={`/${league}/games/${game.espn_id}`} className={`card block px-5 py-4 ${live ? "border-[var(--live)]/40" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
          {label} · {LEAGUE_LABEL[league]}
        </span>
        <StatusPill statusState={game.status_state} statusDetail={game.status_detail} date={game.date} completed={game.completed} round={game.round} stage={game.stage} competitionType={game.competition_type} league={league} />
      </div>
      <div className="flex flex-col gap-2.5">
        {sides.map((t) => (
          <Team key={t.side} name={teamDisplayName(t.name)} logo={t.logo} color={t.color} score={t.score} scoreDisplay={t.scoreDisplay} completed={game.completed} won={t.won} />
        ))}
      </div>
      <p className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-xs font-medium text-[var(--text-muted)]">
        <span>
          {game.completed ? (game.status_summary ?? "Full time") : live ? (game.status_detail ?? "In progress") : <Kickoff league={league} game={game} format="datetime" />}
        </span>
        <span className="font-semibold text-[var(--accent)]">Match centre →</span>
      </p>
    </Link>
  );
}
