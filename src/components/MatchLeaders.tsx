import Link from "next/link";
import type { MatchLeader } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";

export function MatchLeaders({ league, game, leaders, playerSlugs }: { league: League; game: GameRow; leaders: MatchLeader[]; playerSlugs: Map<string, string> }) {
  if (leaders.length === 0) return null;
  const abbr = (id: string) => (id === game.home_team_espn_id ? game.home_abbr ?? game.home_name : game.away_abbr ?? game.away_name);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {leaders.map((l, i) => {
        const slug = playerSlugs.get(l.athlete_id);
        return (
          <div key={i} className="card px-4 py-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {l.label} · {abbr(l.team_id)}
            </p>
            <p className="mt-0.5 font-semibold">
              {slug ? (
                <Link href={`/${league}/players/${slug}`} className="hover:text-[var(--accent)]">{l.athlete}</Link>
              ) : (
                l.athlete
              )}
            </p>
            <p className="text-sm tabular-nums text-[var(--text-muted)]">{l.value}</p>
          </div>
        );
      })}
    </div>
  );
}
