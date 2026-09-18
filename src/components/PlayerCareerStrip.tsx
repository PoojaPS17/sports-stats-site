import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { formatSeasonLabel, LEAGUE_LABEL, type League } from "@/lib/queries";
import { formatStat, type PlayerProfile } from "@/lib/playerProfile";
import { recordText } from "./PlayerStatsShared";

// The numbers a reader came for, in one row: appearances and record on record,
// then the sport's headline figures — all summed from the game log below.
export function PlayerCareerStrip({ league, profile }: { league: League; profile: PlayerProfile }) {
  const soccer = profile.sport === "soccer";
  const headline = profile.profile.specs.filter((s) => s.headline);
  const from = profile.seasons[profile.seasons.length - 1]?.season ?? null;
  const to = profile.seasons[0]?.season ?? null;
  const span = from && to ? (from === to ? formatSeasonLabel(league, from) : `${formatSeasonLabel(league, from)} to ${formatSeasonLabel(league, to)}`) : null;
  const avg = profile.sport === "nba";
  return (
    <div className="card px-4 py-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label={profile.profile.gamesLabel} value={String(profile.games)} />
        <Stat label={soccer ? "W-D-L" : "W-L"} value={recordText(profile.record, soccer)} />
        {headline.map((s) => (
          <Stat key={s.key} label={avg && s.agg === "avg" ? `${s.title} per game` : s.title} value={formatStat(s, profile.career[s.key])} />
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
        <span>
          {LEAGUE_LABEL[league]} games on record{span ? `, ${span}` : ""}.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]" title={label}>
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
    </div>
  );
}
