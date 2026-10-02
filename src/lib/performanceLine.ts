import { formatStat, type Line, type PlayerLogRow, type PlayerProfile, type PlayerSport, type StatSpec } from "./playerProfile";

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

// No delta when this is the season's only recorded game: the "average" would be this game compared
// with itself, and every chip would read "+0 vs season avg" (every Week 1 card, every opener).
function deltaLabel(gameValue: number | null, avg: number | null, spec: StatSpec, seasonGames: number): string | null {
  if (gameValue == null || avg == null || seasonGames < 2) return null;
  const diff = gameValue - avg;
  const magnitude = Number.isInteger(gameValue) ? Math.round(Math.abs(diff)).toLocaleString("en-US") : formatStat(spec, Math.abs(diff));
  // A shortfall that rounds away to nothing is "+0", never "-0".
  const sign = diff < 0 && Number(magnitude.replace(/,/g, "")) !== 0 ? "-" : "+";
  return `${sign}${magnitude} vs season avg`;
}

// A single game's raw value for a counting stat (PTS/REB/AST/STL/BLK/+/-) is always whole;
// spec.decimals on those NBA_SPECS entries exists only to format *season averages* elsewhere
// (e.g. "26.4 PPG"), not this game's value. A genuinely fractional stat (fg_pct) still gets
// formatStat's native one-decimal rendering.
function formatCardValue(spec: StatSpec, v: number | null): string {
  if (v == null) return "–";
  // A spec that spells its own figure out (baseball's ".600" average, "2.38" ERA, "6.0" innings) keeps
  // doing so on a whole number too: six innings pitched is "6.0", never "6".
  if (spec.format) return formatStat(spec, v);
  return Number.isInteger(v) ? v.toLocaleString("en-US") : formatStat(spec, v);
}

function statFor(spec: StatSpec, row: PlayerLogRow, seasonLine: Line, seasonGames: number): PerformanceStat {
  const gameValue = spec.value(row.stats);
  const avg = seasonAverage(spec, seasonLine, seasonGames);
  return { key: spec.key, label: spec.label, title: spec.title, value: formatCardValue(spec, gameValue), delta: deltaLabel(gameValue, avg, spec, seasonGames) };
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

// A baseball card is the box-score line of the half of the game the player took part in: a batter's
// is AB, R, H, HR, RBI, BB, K and his average for the game; a pitcher's is IP, H, R, ER, BB, K and his
// ERA for it. Spelled out here rather than taken from `headline`, for the same reason the NBA's keys
// are: the career strip's headline subset is a different, smaller set (three figures, not seven).
//
// Which of the two a player gets is already decided by `mlbProfile` from his own row history, so a
// card can never disagree with his page about whether he is a pitcher. A two-way player has both sets
// of specs, and the keys below pick his batting line out of them — the hitting is what a card is for —
// plus the pitching figures a reader would miss if they were left out.
const MLB_BATTING_KEYS = ["ab", "r", "h", "hr", "rbi", "bb", "k", "avg"] as const;
const MLB_PITCHING_KEYS = ["ip", "p_h", "p_r", "er", "p_bb", "p_k", "era"] as const;
// A two-way player's card leads with his batting line and adds only what his pitching says in three
// figures, rather than fourteen cells nobody reads on a share image.
const MLB_TWO_WAY_EXTRA_KEYS = ["ip", "er", "era"] as const;

function mlbLine(row: PlayerLogRow, profile: PlayerProfile): PerformanceStat[] {
  const bySpecKey = new Map(profile.profile.specs.map((s) => [s.key, s]));
  const seasonLine = seasonLineFor(row, profile);
  const seasonEntry = profile.seasons.find((s) => s.season === row.season_year);
  const seasonGames = seasonEntry?.recorded ?? profile.rows.length;
  const bats = bySpecKey.has("avg");
  const pitches = bySpecKey.has("era");
  const keys: readonly string[] = bats && pitches ? [...MLB_BATTING_KEYS, ...MLB_TWO_WAY_EXTRA_KEYS] : bats ? MLB_BATTING_KEYS : MLB_PITCHING_KEYS;
  return keys.flatMap((key) => {
    const spec = bySpecKey.get(key);
    return spec ? [statFor(spec, row, seasonLine, seasonGames)] : [];
  });
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
  if (sport === "mlb") return mlbLine(row, profile);
  throw new Error(`performanceLine: unsupported sport "${sport}" — cards exist for the US sports only`);
}
