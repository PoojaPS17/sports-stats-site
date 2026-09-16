import { SectionHeader } from "./SectionHeader";
import { SeasonTabs } from "./SeasonTabs";
import type { PlayerSeasonStats as PlayerSeasonStatsType, League } from "@/lib/queries";

export function StatGroup({ category, values }: { category: string; values: Record<string, string> }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{category}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(values).map(([k, v]) => (
          <span key={k} className="text-sm">
            <span className="font-semibold tabular-nums">{v}</span>{" "}
            <span className="text-xs text-[var(--text-muted)]">{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PlayerSeasonStats({
  league,
  stats,
  seasons,
  activeSeason,
  basePath,
}: {
  league: League;
  stats: PlayerSeasonStatsType | null;
  seasons: number[];
  activeSeason: number | null;
  basePath: string;
}) {
  return (
    <section>
      <SectionHeader>Season Stats</SectionHeader>
      <div className="mb-3">
        <SeasonTabs league={league} basePath={basePath} seasons={seasons} activeSeason={activeSeason} />
      </div>
      {!stats ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No stats recorded for this season.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(stats.categories).map(([category, { labels, values }]) => (
            <StatGroup key={category} category={category} values={Object.fromEntries(labels.map((l, i) => [l, values[i]]))} />
          ))}
        </div>
      )}
    </section>
  );
}
