import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { getHeadToHead, isSoccer } from "@/lib/analytics";
import { h2hPath } from "@/lib/h2h";
import type { League } from "@/lib/queries";
import { scoreLineHomeFirst } from "@/lib/gamePage";

// Compact all-time record shown on a match page, linking to the full head-to-head
// history. `excludeGameId` keeps a completed match from counting itself in "previous
// meetings".
export async function HeadToHeadStrip({
  league,
  homeSlug,
  awaySlug,
  excludeGameId,
}: {
  league: League;
  homeSlug: string;
  awaySlug: string;
  excludeGameId: string | null;
}) {
  // teamA is the side listed first: football lists the home side first (like the match header above), the NBA and NFL the visitors.
  const [firstSlug, secondSlug] = scoreLineHomeFirst(league) ? [homeSlug, awaySlug] : [awaySlug, homeSlug];
  const h2h = await getHeadToHead(league, firstSlug, secondSlug);
  if (!h2h) return null;
  const games = excludeGameId ? h2h.games.filter((g) => g.espn_id !== excludeGameId) : h2h.games;
  if (games.length === 0) return null;

  // Recount without the excluded game.
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  for (const g of games) {
    const aIsHome = g.home_team_espn_id === h2h.teamA.espn_id;
    const gf = aIsHome ? g.home_score! : g.away_score!;
    const ga = aIsHome ? g.away_score! : g.home_score!;
    if (gf > ga) winsA++;
    else if (gf < ga) winsB++;
    else draws++;
  }
  const total = games.length;
  const soccer = isSoccer(league);
  const last = games.slice(0, 5);

  return (
    <Link href={h2hPath(league, homeSlug, awaySlug)} className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Head-to-head</span>
      <span className="flex items-center gap-2 font-semibold">
        <span>{h2h.teamA.abbreviation ?? teamDisplayName(h2h.teamA.name)}</span>
        <span className="tabular-nums text-[var(--win)]">{winsA}</span>
        {soccer && (
          <>
            <span className="text-[var(--text-faint)]">·</span>
            <span className="tabular-nums text-[var(--draw)]">{draws}</span>
          </>
        )}
        <span className="text-[var(--text-faint)]">·</span>
        <span className="tabular-nums text-[var(--win)]">{winsB}</span>
        <span>{h2h.teamB.abbreviation ?? teamDisplayName(h2h.teamB.name)}</span>
      </span>
      <span className="text-xs text-[var(--text-muted)]">
        {total} previous {total === 1 ? "meeting" : "meetings"}
      </span>
      <span className="ml-auto flex items-center gap-1" aria-label="Last five meetings">
        {last.map((g) => {
          const aIsHome = g.home_team_espn_id === h2h.teamA.espn_id;
          const gf = aIsHome ? g.home_score! : g.away_score!;
          const ga = aIsHome ? g.away_score! : g.home_score!;
          const r = gf > ga ? "W" : gf < ga ? "L" : "D";
          return (
            <span key={g.espn_id} className={`result-badge result-${r.toLowerCase()}`} title={scoreLineHomeFirst(league) ? `${teamDisplayName(g.home_name)} ${g.home_score} - ${g.away_score} ${teamDisplayName(g.away_name)}` : `${teamDisplayName(g.away_name)} ${g.away_score} - ${g.home_score} ${teamDisplayName(g.home_name)}`}>
              {r === "W" ? (h2h.teamA.abbreviation ?? "A").slice(0, 3) : r === "L" ? (h2h.teamB.abbreviation ?? "B").slice(0, 3) : "D"}
            </span>
          );
        })}
        <span className="ml-2 text-xs font-semibold text-[var(--accent)]">Full history →</span>
      </span>
    </Link>
  );
}
