import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import type { League } from "@/lib/queries";
import type { PlayerProfile } from "@/lib/playerProfile";
import { fmtDate } from "./PlayerStatsShared";
import { ImageActions } from "./ImageActions";
import { performancePagePath } from "@/lib/performanceCardData";

// Career landmarks pinned to the game they happened in. "On record" because the log
// starts where our data does (about a decade back), not at the player's debut.
export function PlayerMilestones({ league, slug, profile }: { league: League; slug: string; profile: PlayerProfile }) {
  const showCardShare = league === "nba" || league === "nfl";
  return (
    <ul className="card divide-y divide-[var(--border)] text-sm">
      {profile.milestones.map((m, i) => (
        <li key={`${m.label}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
          <span className="font-semibold">
            {m.label}
            {m.detail && <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{m.detail}</span>}
          </span>
          {m.game && (
            <span className="flex flex-wrap items-center gap-2">
              <Link href={`/${league}/games/${m.game.game_espn_id}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                {m.game.is_home ? "vs" : "at"} {teamDisplayName(m.game.opponent_name)}, {fmtDate(m.game.date, league)}
              </Link>
              {showCardShare && (
                <>
                  <ImageActions filename={`${m.game.game_espn_id}-${slug}-card-${league}`} imageUrl={`/${league}/games/${m.game.game_espn_id}/players/${slug}/card?format=og`} shareTitle={`Performance card`} />
                  <Link href={performancePagePath(league, m.game.game_espn_id, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                    View full breakdown
                  </Link>
                </>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
