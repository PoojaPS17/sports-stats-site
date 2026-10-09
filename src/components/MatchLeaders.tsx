import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import type { MatchLeader } from "@/lib/matchDetail";
import type { GameRow, League } from "@/lib/queries";
import { performancePagePath, supportsPerformanceCards } from "@/lib/performanceCardData";

import { ImageActions } from "./ImageActions";

// gameId is only used to build the per-player performance-card image URL below (the US sports only);
// every other league passes leaders without it and never renders that button.
export function MatchLeaders({ league, game, gameId, leaders, playerSlugs }: { league: League; game: GameRow; gameId?: string; leaders: MatchLeader[]; playerSlugs: Map<string, string> }) {
  if (leaders.length === 0) return null;
  const abbr = (id: string) => (id === game.home_team_espn_id ? game.home_abbr ?? teamDisplayName(game.home_name) : game.away_abbr ?? teamDisplayName(game.away_name));
  const showCardShare = gameId && supportsPerformanceCards(league);
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
                <Link prefetch={false} href={`/${league}/players/${slug}`} className="hover:text-[var(--accent)]">{l.athlete}</Link>
              ) : (
                l.athlete
              )}
            </p>
            <p className="text-sm tabular-nums text-[var(--text-muted)]">{l.value}</p>
            {/* Kept beside this player's own name/value, not in a separate list below, so a
                Share/Download pair is never orphaned from whose card it shares. */}
            {showCardShare && slug && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <ImageActions filename={`${gameId}-${slug}-card-${league}`} imageUrl={`/${league}/games/${gameId}/players/${slug}/card?format=og`} shareTitle={`${l.athlete} performance card`} />
                <Link prefetch={false} href={performancePagePath(league, gameId!, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                  View full breakdown
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
