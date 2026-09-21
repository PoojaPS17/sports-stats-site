import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { formatSeasonLabel, LEAGUE_LABEL, type League } from "@/lib/queries";
import type { PlayerProfile } from "@/lib/playerProfile";
import { careerStripStats } from "./PlayerStatsShared";
import { careerStripSuffix } from "@/lib/playerCopy";

// The numbers a reader came for, in one row: games and record, then the sport's headline figures,
// as the profile has them (summed from the game log, or ESPN's own season figures for a season the log is short of).
export function PlayerCareerStrip({ league, profile }: { league: League; profile: PlayerProfile }) {
  const from = profile.seasons[profile.seasons.length - 1]?.season ?? null;
  const to = profile.seasons[0]?.season ?? null;
  const span = from && to ? (from === to ? formatSeasonLabel(league, from) : `${formatSeasonLabel(league, from)} to ${formatSeasonLabel(league, to)}`) : null;
  return (
    <div className="card px-4 py-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {careerStripStats(profile).map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} title={s.title} noBoxScore={s.noBoxScore} />
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
        <span>
          {LEAGUE_LABEL[league]}{profile.sport !== "soccer" ? " regular season" : ""}{span ? `, ${span}` : ""}.{careerStripSuffix(league, from)}
        </span>
        {profile.teams.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Played for</span>
            {profile.teams.map((t) => (
              <Link key={t.espn_id} href={`/${league}/teams/${t.slug}`} className="inline-flex items-center gap-1 font-semibold text-[var(--text)] hover:text-[var(--accent)]">
                <TeamLogo name={teamDisplayName(t.name)} logoUrl={t.logo} size={14} />
                {t.name}
              </Link>
            ))}
          </span>
        )}
      </p>
    </div>
  );
}

function Stat({ label, value, title, noBoxScore }: { label: string; value: string; title?: string; noBoxScore?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]" title={title ?? label}>
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl" title={noBoxScore ? title : undefined}>
        {value}
      </p>
    </div>
  );
}
