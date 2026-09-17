import Link from "next/link";
import type { Tour, TennisMatchRow } from "@/lib/tennis";

function PlayerRow({ name, won, completed }: { name: string; won: boolean; completed: boolean }) {
  return <span className={`truncate text-sm ${completed && won ? "font-bold text-[var(--text)]" : "font-medium"}`}>{name}</span>;
}

export function TennisMatchCard({ tour, match }: { tour: Tour; match: TennisMatchRow }) {
  const p1Won = match.winner_espn_id === match.player1_espn_id;
  const p2Won = match.winner_espn_id === match.player2_espn_id;

  return (
    <div className="card flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{match.tournament_name}</span>
        <span className={`pill shrink-0 ${match.completed ? "pill-final" : "pill-upcoming"}`}>
          {match.round ?? (match.completed ? "Final" : new Date(match.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
        </span>
      </div>
      <PlayerRow name={match.player1_name} won={p1Won} completed={match.completed} />
      <PlayerRow name={match.player2_name} won={p2Won} completed={match.completed} />
      {match.completed && match.score_display && (
        <p className="mt-1 border-t border-[var(--border)] pt-1.5 text-xs font-medium text-[var(--accent)]">{match.score_display}</p>
      )}
      <div className="mt-1 flex gap-3 text-xs">
        <Link href={`/tennis/${tour}/players/${match.player1_slug}`} className="text-[var(--accent)] hover:underline">
          {match.player1_name.split(" ").slice(-1)[0]}&apos;s profile
        </Link>
        <Link href={`/tennis/${tour}/players/${match.player2_slug}`} className="text-[var(--accent)] hover:underline">
          {match.player2_name.split(" ").slice(-1)[0]}&apos;s profile
        </Link>
      </div>
    </div>
  );
}
