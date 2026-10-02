import { POSTSEASON_PREFIX } from "../../src/lib/espnSeason";
import { pool } from "./db";
import { fetchAthleteSeasonStats, type League } from "./espn";
import { mlbCategoryKind, postseasonCategoriesOf, postseasonRows, seasonGamesPlayed, seasonRow, seasonWindowStart, soccerPostseasonRow } from "./season-row";

// Which of a category's rows a season stores (ESPN's Totals row for a traded player, and the
// league filter for soccer), and an NFL season's games played (ESPN's own GP, summed over a traded
// player's teams, the Totals row's first-team GP being only a floor), live in season-row.ts, which
// has no database import.
export { seasonRow } from "./season-row";

function categoryKey(category: any): string {
  return category.name ?? category.displayName ?? "stats";
}

function numberAt(labels: string[], values: string[], label: string): number | null {
  const i = labels.indexOf(label);
  if (i === -1 || values[i] === undefined) return null;
  const n = Number(String(values[i]).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 0 isn't a meaningful "leader" value (e.g. every player technically has 0 passing
// yards unless they're a QB) — treat it as absent for leaderboard ranking purposes.
function positiveOrNull(n: number | null): number | null {
  return n !== null && n > 0 ? n : null;
}

async function upsertOneSeason(
  league: League,
  playerEspnId: string,
  teamEspnId: string | null,
  seasonYear: number,
  categories: any[],
  leagueSlug: string | undefined,
  postseasonCategories: any[] = []
): Promise<boolean> {
  const out: Record<string, { labels: string[]; values: string[] }> = {};
  let ptsAvg: number | null = null;
  let rebAvg: number | null = null;
  let astAvg: number | null = null;
  let passingYards: number | null = null;
  let rushingYards: number | null = null;
  let receivingYards: number | null = null;
  let goals: number | null = null;
  let assists: number | null = null;
  let gamesPlayed: number | null = null;
  // Baseball. A category is identified by `mlbCategoryKind`, not by its raw name, and the postseason
  // lines come back in this same response rather than needing a second request (see season-row.ts).
  let homeRuns: number | null = null;
  let rbi: number | null = null;
  let battingAvg: number | null = null;
  let strikeouts: number | null = null;
  let era: number | null = null;
  let pitchingWins: number | null = null;
  let inningsPitched: number | null = null;
  let found = false;

  for (const category of categories) {
    const row = seasonRow(category, seasonYear, leagueSlug);
    if (!row) continue;
    found = true;
    const key = categoryKey(category);
    out[key] = row;

    if (key === "averages") {
      ptsAvg = positiveOrNull(numberAt(row.labels, row.values, "PTS"));
      rebAvg = positiveOrNull(numberAt(row.labels, row.values, "REB"));
      astAvg = positiveOrNull(numberAt(row.labels, row.values, "AST"));
      gamesPlayed = positiveOrNull(numberAt(row.labels, row.values, "GP"));
    }
    if (key === "passing") passingYards = positiveOrNull(numberAt(row.labels, row.values, "YDS"));
    if (key === "rushing") rushingYards = positiveOrNull(numberAt(row.labels, row.values, "YDS"));
    if (key === "receiving") receivingYards = positiveOrNull(numberAt(row.labels, row.values, "YDS"));
    // Soccer's outfield-player category — goalkeepers get a different "goalkeeping"
    // category instead, so this naturally stays null for them.
    if (key === "offensive") {
      goals = positiveOrNull(numberAt(row.labels, row.values, "G"));
      assists = positiveOrNull(numberAt(row.labels, row.values, "A"));
    }
    if (league === "mlb") {
      const kind = mlbCategoryKind(key);
      // The postseason line is stored under its own key (below) and must not overwrite the
      // regular-season figures the boards rank by.
      if (kind === "batting") {
        homeRuns = positiveOrNull(numberAt(row.labels, row.values, "HR"));
        rbi = positiveOrNull(numberAt(row.labels, row.values, "RBI"));
        // ".291" parses as 0.291. A .000 average reads as no average, like every other zero here.
        battingAvg = positiveOrNull(numberAt(row.labels, row.values, "AVG"));
        gamesPlayed = positiveOrNull(numberAt(row.labels, row.values, "GP"));
      }
      if (kind === "pitching") {
        // A pitcher's strikeouts, which is the board baseball means by "strikeouts"; a batter's are
        // the ones he took, and no board ranks those.
        strikeouts = positiveOrNull(numberAt(row.labels, row.values, "K"));
        era = positiveOrNull(numberAt(row.labels, row.values, "ERA"));
        pitchingWins = positiveOrNull(numberAt(row.labels, row.values, "W"));
        inningsPitched = positiveOrNull(numberAt(row.labels, row.values, "IP"));
        // A pitcher has no batting category, so his games come from here instead.
        gamesPlayed = gamesPlayed ?? positiveOrNull(numberAt(row.labels, row.values, "GP"));
      }
      // Stored under the prefixed key the site reads a postseason line by (src/lib/espnSeason.ts).
      if (kind === "postseason_batting" || kind === "postseason_pitching") {
        delete out[key];
        out[kind] = row;
      }
    }
  }

  if (!found) return false;

  // NBA: ESPN's postseason line for the season (when the player had one) is stored in the same JSON under its own keys,
  // so every regular-season key above stays exactly as it was and no schema change is needed.
  Object.assign(out, postseasonRows(postseasonCategories, seasonYear));
  // MLS: the feed's playoffs row for the season sits in the same sport-wide response, so it is stored the same way.
  if (leagueSlug) {
    for (const category of categories) {
      const playoffs = soccerPostseasonRow(category, seasonYear, leagueSlug);
      if (playoffs) out[`${POSTSEASON_PREFIX}${categoryKey(category)}`] = playoffs;
    }
  }

  // NBA's games played came from its `averages` category above; soccer stays null. NFL's is ESPN's
  // own GP (the site's box-score rows list only players with a stat line, so counting them undercounts).
  if (league === "nfl") gamesPlayed = positiveOrNull(seasonGamesPlayed(categories, seasonYear));

  // Every scalar column, so the insert, the update and the is-distinct-from guard can never list a
  // different set of them — which is how a column gets written on insert and quietly never updated.
  const COLUMNS = [
    "team_espn_id",
    "categories",
    "pts_avg",
    "reb_avg",
    "ast_avg",
    "passing_yards",
    "rushing_yards",
    "receiving_yards",
    "goals",
    "assists",
    "games_played",
    "home_runs",
    "rbi",
    "batting_avg",
    "strikeouts",
    "era",
    "pitching_wins",
    "innings_pitched",
  ];
  const values = [teamEspnId, JSON.stringify(out), ptsAvg, rebAvg, astAvg, passingYards, rushingYards, receivingYards, goals, assists, gamesPlayed, homeRuns, rbi, battingAvg, strikeouts, era, pitchingWins, inningsPitched];
  const placeholders = COLUMNS.map((_, i) => `$${i + 4}`).join(", ");
  const tuple = (prefix: string) => COLUMNS.map((c) => `${prefix}${c}`).join(", ");
  await pool.query(
    `insert into player_season_stats (league, season, player_espn_id, ${COLUMNS.join(", ")}, updated_at)
     values ($1,$2,$3, ${placeholders}, now())
     on conflict (league, season, player_espn_id) do update set
       ${COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = now()
     where (${tuple("player_season_stats.")}) is distinct from (${tuple("excluded.")})`,
    [league, seasonYear, playerEspnId, ...values]
  );
  return true;
}

// The athlete season-stats endpoint returns a player's whole career history in one
// response (one row per season per category) — so storing every season back to the league's
// window start (seasonWindowStart, or `currentYear - yearsBack` when a caller passes one) costs
// the exact same single request as storing just the current one used to. Called both by the
// recurring scraper (keeps the current season fresh) and the one-time historical backfill
// (populates the earlier seasons for free from the same response).
const SOCCER_LEAGUE_SLUG: Partial<Record<League, string>> = {
  epl: "eng.1",
  laliga: "esp.1",
  bundesliga: "ger.1",
  seriea: "ita.1",
  ucl: "uefa.champions",
  ligue1: "fra.1",
  europa: "uefa.europa",
  mls: "usa.1",
  saudi: "ksa.1",
};

export async function upsertPlayerSeasonStats(
  league: League,
  playerEspnId: string,
  teamEspnId: string | null,
  yearsBack?: number
): Promise<number> {
  const data = await fetchAthleteSeasonStats(league, playerEspnId);
  // ESPN answers a rostered player with no stats at all (0 years of experience) with no `categories` array: he has no season to
  // store, silently, and nothing is asked about his postseason (whose answer would be just as empty). An error body that
  // `getJson` parsed anyway looks the same and has always been a silent 0 here: nothing is written either way.
  if (!Array.isArray(data.categories)) return 0;
  // NBA: one more request for the postseason line (seasontype=3), for a player whose regular-season response HAS categories. Then
  // a response that is not a real answer (no categories array, no seasontype filter: an error body `getJson` parsed anyway) throws,
  // which fails the player's whole update instead of rewriting the stored row without the `postseason_*` keys a previous run
  // stored (`categories = excluded.categories`). Baseball needs no second request: its postseason
  // categories are in the response above (see mlbCategoryKind in season-row.ts).
  const postseasonCategories = league === "nba" ? postseasonCategoriesOf(await fetchAthleteSeasonStats(league, playerEspnId, 3)) : [];
  // An explicit `yearsBack` is a relative window; the default is the league's pinned start (seasonWindowStart).
  const currentYear = new Date().getUTCFullYear();
  const minYear = yearsBack === undefined ? seasonWindowStart(league, currentYear) : currentYear - yearsBack;
  return storeAthleteSeasons(league, playerEspnId, teamEspnId, data, minYear, postseasonCategories);
}

/**
 * The half of the loader that is only the response: which seasons it holds and what each one stores.
 * Split out from the fetch so tests can drive it from a saved ESPN response (tests/fixtures), which is
 * how the MLB category reading is held to the real thing rather than to a hand-written shape.
 */
export async function storeAthleteSeasons(
  league: League,
  playerEspnId: string,
  teamEspnId: string | null,
  data: { categories?: unknown },
  minYear: number,
  postseasonCategories: any[] = []
): Promise<number> {
  if (!Array.isArray(data.categories)) return 0;
  const categories: any[] = data.categories;
  // Soccer's stats endpoint is sport-wide, so seasons must be filtered to the actual
  // league's rows (leagueSlug "eng.1", "esp.1", ...) — otherwise a player's time at a club
  // in a different country's league would be collected and stored as if it were an EPL season.
  const leagueSlug = SOCCER_LEAGUE_SLUG[league];

  const years = new Set<number>();
  for (const category of categories) {
    for (const row of category.statistics ?? []) {
      const y = row.season?.year;
      if (typeof y === "number" && y >= minYear && (!leagueSlug || row.leagueSlug === leagueSlug)) years.add(y);
    }
  }

  let count = 0;
  for (const year of years) {
    if (await upsertOneSeason(league, playerEspnId, teamEspnId, year, categories, leagueSlug, postseasonCategories)) count++;
  }
  return count;
}
