import Link from "next/link";
import type { Tour, TennisMatchRow } from "@/lib/tennis";

function PlayerRow({ href, name, won, completed }: { href: string; name: string; won: boolean; completed: boolean }) {
  const loser = completed && !won;
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 py-1 hover:text-[var(--accent)] ${
        loser ? "font-medium text-[var(--text-muted)]" : "font-semibold text-[var(--text)]"
      }`}
    >
      <span className="truncate text-[15px]">{name}</span>
      {completed && won && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Winner" className="shrink-0 text-[var(--win)]">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </Link>
  );
}

export function TennisMatchCard({ tour, match }: { tour: Tour; match: TennisMatchRow }) {
  const p1Won = match.winner_espn_id === match.player1_espn_id;
  const p2Won = match.winner_espn_id === match.player2_espn_id;

  return (
    <div className="card flex flex-col gap-1 px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{match.tournament_name}</span>
        <span className={`pill shrink-0 ${match.completed ? "pill-final" : "pill-upcoming"}`}>
          {match.round ?? (match.completed ? "Final" : new Date(match.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
        </span>
      </div>
      <PlayerRow href={`/tennis/${tour}/players/${match.player1_slug}`} name={match.player1_name} won={p1Won} completed={match.completed} />
      <PlayerRow href={`/tennis/${tour}/players/${match.player2_slug}`} name={match.player2_name} won={p2Won} completed={match.completed} />
      {match.completed && match.score_display && (
        <p className="mt-1 border-t border-[var(--border)] pt-1.5 text-xs text-[var(--text-muted)]">{match.score_display}</p>
      )}
    </div>
  );
}
