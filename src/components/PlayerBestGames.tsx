import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { normalizeStage } from "@/lib/stage";
import { TeamLogo } from "./TeamLogo";
import { formatSeasonLabel, type League } from "@/lib/queries";
import { formatStat, type PlayerLogRow, type PlayerProfile } from "@/lib/playerProfile";
import { fmtDate, ResultChip } from "./PlayerStatsShared";
import { ImageActions } from "./ImageActions";
import { performancePagePath, supportsPerformanceCards } from "@/lib/performanceCardData";

/** The game's non-zero figures across the sport's log columns, e.g. "2 G · 1 A · 5 SOT". */
export function statLine(profile: PlayerProfile, row: PlayerLogRow): string {
  return profile.profile.specs
    .filter((s) => s.log !== false && !s.rate)
    .map((s) => ({ s, v: s.value(row.stats) }))
    .filter(({ v }) => v !== null && v !== 0)
    .map(({ s, v }) => `${formatStat(s, v)} ${s.label}`)
    .join(" · ");
}

export function PlayerBestGames({ league, slug, profile }: { league: League; slug: string; profile: PlayerProfile }) {
  const showCardShare = supportsPerformanceCards(league);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {profile.best.map((row, i) => (
        <div key={row.game_espn_id} className="card flex flex-col gap-2 px-4 py-3 text-sm">
          <Link href={`/${league}/games/${row.game_espn_id}`} className="flex items-start gap-3">
            <span className="mt-0.5 w-5 shrink-0 text-lg font-bold tabular-nums text-[var(--text-faint)]">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <TeamLogo name={teamDisplayName(row.opponent_name)} logoUrl={row.opponent_logo} size={18} />
                <span className="truncate font-semibold">
                  {row.is_home ? "vs" : "at"} {teamDisplayName(row.opponent_name)}
                </span>
                <ResultChip row={row} />
              </span>
              <span className="mt-1 block font-medium tabular-nums">{statLine(profile, row) || "No figures recorded"}</span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                {fmtDate(row.date, league)}
                {row.season_year ? ` · ${formatSeasonLabel(league, row.season_year)}` : ""}
                {row.round ? ` · ${normalizeStage(row.round)}` : row.week ? ` · Week ${row.week}` : ""}
              </span>
            </span>
          </Link>
          {showCardShare && (
            <div className="flex flex-wrap items-center gap-2 pl-8">
              <ImageActions filename={`${row.game_espn_id}-${slug}-card-${league}`} imageUrl={`/${league}/games/${row.game_espn_id}/players/${slug}/card?format=og`} shareTitle={`Performance card`} />
              <Link href={performancePagePath(league, row.game_espn_id, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                View full breakdown
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
