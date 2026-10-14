// Which MLB box-score lines are worth a page of their own. NBA and NFL games carry ESPN's "leaders" (stored in
// game_details), and a performance page is indexed and listed in the sitemap when its player is one of them.
// ESPN's baseball summary has no leaders at all (checked on three games, 2026-10-14: 7,449 stored MLB games, none
// with leaders), so MLB reads the box score itself. One definition, in two forms that must agree: `isMlbStandout`
// for the page and `mlbStandoutSql` for the sitemap query (tests/mlb-standouts.test.ts runs both over the same rows).
import type { Stats } from "./playerProfile";

// A performance people look up or share, not a full lineup: a multi-homer game, a four-hit game, a five-RBI game, ten
// strikeouts, or seven innings with at most one earned run. Raise a number to list fewer pages, lower it for more.
export const MLB_STANDOUT = { homeRuns: 2, hits: 4, rbi: 5, strikeouts: 10, innings: 7, earnedRunsAtMost: 1 } as const;

const figure = (stats: Stats, category: "batting" | "pitching", label: string): number | null => {
  const raw = stats[category]?.[label];
  return typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
};

export function isMlbStandout(stats: Stats): boolean {
  const m = MLB_STANDOUT;
  const at = (category: "batting" | "pitching", label: string) => figure(stats, category, label);
  const innings = at("pitching", "IP");
  const earned = at("pitching", "ER");
  return (
    (at("batting", "HR") ?? 0) >= m.homeRuns ||
    (at("batting", "H") ?? 0) >= m.hits ||
    (at("batting", "RBI") ?? 0) >= m.rbi ||
    (at("pitching", "K") ?? 0) >= m.strikeouts ||
    (innings !== null && earned !== null && innings >= m.innings && earned <= m.earnedRunsAtMost)
  );
}

/** The same test over `player_game_stats.stats` (jsonb) of the row aliased `alias`: a missing or non-numeric cell is NULL, so never a standout. */
export function mlbStandoutSql(alias: string): string {
  const m = MLB_STANDOUT;
  const n = (category: string, label: string) => `(case when ${alias}.stats->'${category}'->>'${label}' ~ '^[0-9]+(\\.[0-9]+)?$' then (${alias}.stats->'${category}'->>'${label}')::numeric end)`;
  return `(${n("batting", "HR")} >= ${m.homeRuns}
    or ${n("batting", "H")} >= ${m.hits}
    or ${n("batting", "RBI")} >= ${m.rbi}
    or ${n("pitching", "K")} >= ${m.strikeouts}
    or (${n("pitching", "IP")} >= ${m.innings} and ${n("pitching", "ER")} <= ${m.earnedRunsAtMost}))`;
}
