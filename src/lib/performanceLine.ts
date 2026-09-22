import { cell, formatStat, type Line, type PlayerLogRow, type PlayerProfile, type PlayerSport, type StatSpec } from "./playerProfile";

export interface PerformanceStat {
  key: string;
  label: string;
  title: string;
  value: string;
  delta: string | null;
}

// Fixed per spec §1 ("NBA: PTS, REB, AST, STL, BLK, with FG, 3P, FT made-attempted and +/-"),
// not the `headline`-flagged subset used by the career strip (that subset omits STL/BLK/+/-
// and the made-attempted pairs).
const NBA_KEYS = ["pts", "reb", "ast", "stl", "blk", "fg_pct", "pm"] as const;
// Made-attempted pairs shown as "12-19" rather than as two separate spec rows.
const NBA_MA_PAIRS: { key: string; made: string; att: string; title: string }[] = [
  { key: "fgm_fga", made: "fgm", att: "fga", title: "Field goals" },
  { key: "tpm_tpa", made: "tpm", att: "tpa", title: "Three-pointers" },
  { key: "ftm_fta", made: "ftm", att: "fta", title: "Free throws" },
];

function seasonLineFor(row: PlayerLogRow, profile: PlayerProfile): Line {
  return profile.seasons.find((s) => s.season === row.season_year)?.line ?? profile.career;
}

// A spec's season-average per game: SeasonLine.line already holds a per-game average for an
// "avg"-aggregated spec (NBA), but a per-game *total* for a "sum"-aggregated spec (NFL) — that
// total must be divided by the season's game count to be comparable to one game's value.
function seasonAverage(spec: StatSpec, seasonLine: Line, seasonGames: number): number | null {
  const v = seasonLine[spec.key];
  if (v == null) return null;
  if (spec.agg !== "sum") return v;
  return seasonGames > 0 ? v / seasonGames : null;
}

function deltaLabel(gameValue: number | null, avg: number | null, spec: StatSpec): string | null {
  if (gameValue == null || avg == null) return null;
  const diff = gameValue - avg;
  const sign = diff >= 0 ? "+" : "-";
  const magnitude = Number.isInteger(gameValue) ? Math.round(Math.abs(diff)).toLocaleString("en-US") : formatStat(spec, Math.abs(diff));
  return `${sign}${magnitude} vs season avg`;
}

// A single game's raw value for a counting stat (PTS/REB/AST/STL/BLK/+/-) is always whole;
// spec.decimals on those NBA_SPECS entries exists only to format *season averages* elsewhere
// (e.g. "26.4 PPG"), not this game's value. A genuinely fractional stat (fg_pct) still gets
// formatStat's native one-decimal rendering.
function formatCardValue(spec: StatSpec, v: number | null): string {
  if (v == null) return "–";
  return Number.isInteger(v) ? v.toLocaleString("en-US") : formatStat(spec, v);
}

function statFor(spec: StatSpec, row: PlayerLogRow, seasonLine: Line, seasonGames: number): PerformanceStat {
  const gameValue = spec.value(row.stats);
  const avg = seasonAverage(spec, seasonLine, seasonGames);
  return { key: spec.key, label: spec.label, title: spec.title, value: formatCardValue(spec, gameValue), delta: deltaLabel(gameValue, avg, spec) };
}

function nbaLine(row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  const bySpecKey = new Map(profile.profile.specs.map((s) => [s.key, s]));
  const seasonLine = seasonLineFor(row, profile);
  const seasonEntry = profile.seasons.find((s) => s.season === row.season_year);
  const seasonGames = seasonEntry?.recorded ?? profile.rows.length;

  const simple = NBA_KEYS.map((key) => statFor(bySpecKey.get(key)!, row, seasonLine, seasonGames));
  const pairs = NBA_MA_PAIRS.map(({ key, made, att, title }) => {
    const madeSpec = bySpecKey.get(made)!;
    const attSpec = bySpecKey.get(att)!;
    const m = madeSpec.value(row.stats);
    const a = attSpec.value(row.stats);
    return { key, label: madeSpec.label.replace("M", ""), title, value: m == null || a == null ? "–" : `${formatStat(madeSpec, m)}-${formatStat(attSpec, a)}`, delta: null };
  });
  return [...simple.filter((s) => NBA_KEYS.includes(s.key as (typeof NBA_KEYS)[number])), ...pairs];
}

function nflLine(row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  const seasonLine = seasonLineFor(row, profile);
  const seasonEntry = profile.seasons.find((s) => s.season === row.season_year);
  const seasonGames = seasonEntry?.recorded ?? profile.rows.length;
  // Position-appropriate specs are already resolved by buildProfile/nflProfile (active category
  // detection from the player's own row history) — reuse them rather than re-deriving a position
  // group here, so a card can never disagree with the page about which categories this player plays.
  return profile.profile.specs.filter((s) => s.headline).map((spec) => statFor(spec, row, seasonLine, seasonGames));
}

export function performanceLine(sport: PlayerSport, row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  if (sport === "nba") return nbaLine(row, profile);
  if (sport === "nfl") return nflLine(row, profile);
  throw new Error(`performanceLine: unsupported sport "${sport}" — phase 1 is NBA and NFL only`);
}
