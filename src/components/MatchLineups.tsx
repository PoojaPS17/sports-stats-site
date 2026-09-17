import Link from "next/link";
import type { LineupPlayer, TeamLineup } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";

function Row({ league, p, slugs, sub }: { league: League; p: LineupPlayer; slugs: Map<string, string>; sub: boolean }) {
  const slug = slugs.get(p.id);
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-[var(--text-faint)]">{p.jersey ?? ""}</span>
      <span className="min-w-0 flex-1 truncate">
        {slug ? (
          <Link href={`/${league}/players/${slug}`} className="hover:text-[var(--accent)]">{p.name}</Link>
        ) : (
          p.name
        )}
        {!sub && p.position && <span className="ml-1 text-xs text-[var(--text-faint)]">{p.position}</span>}
        {sub && p.in_for && <span className="ml-1 text-xs text-[var(--text-muted)]">for {p.in_for}</span>}
      </span>
      {p.minute && <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{sub ? "▲" : "▼"} {p.minute}</span>}
    </li>
  );
}

export function MatchLineups({ league, game, lineups, playerSlugs }: { league: League; game: GameRow; lineups: TeamLineup[]; playerSlugs: Map<string, string> }) {
  const ordered = [game.home_team_espn_id, game.away_team_espn_id]
    .map((id) => lineups.find((l) => l.team_id === id))
    .filter((l): l is TeamLineup => Boolean(l));
  if (ordered.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ordered.map((l) => {
        const name = l.team_id === game.home_team_espn_id ? game.home_name : game.away_name;
        return (
          <div key={l.team_id} className="card px-4 py-3">
            <h3 className="flex items-baseline justify-between text-sm font-bold">
              <span>{name}</span>
              {l.formation && <span className="text-xs font-semibold text-[var(--text-muted)]">{l.formation}</span>}
            </h3>
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {l.starters.map((p) => (
                <Row key={p.id} league={league} p={p} slugs={playerSlugs} sub={false} />
              ))}
            </ul>
            {l.subs.length > 0 && (
              <>
                <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Substitutes used</p>
                <ul className="divide-y divide-[var(--border)]">
                  {l.subs.map((p) => (
                    <Row key={p.id} league={league} p={p} slugs={playerSlugs} sub />
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
