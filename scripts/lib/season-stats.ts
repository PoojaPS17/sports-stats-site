import { pool } from "./db";
import { fetchAthleteSeasonStats, type League } from "./espn";

import { postseasonCategoriesOf, postseasonRows, seasonGamesPlayed, seasonRow, seasonWindowStart } from "./season-row";

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
  }

  if (!found) return false;

  // NBA: ESPN's postseason line for the season (when the player had one) is stored in the same JSON under its own keys,
  // so every regular-season key above stays exactly as it was and no schema change is needed.
  Object.assign(out, postseasonRows(postseasonCategories, seasonYear));

  // NBA's games played came from its `averages` category above; soccer stays null. NFL's is ESPN's
  // own GP (the site's box-score rows list only players with a stat line, so counting them undercounts).
  if (league === "nfl") gamesPlayed = positiveOrNull(seasonGamesPlayed(categories, seasonYear));

  await pool.query(
    `insert into player_season_stats (
       league, season, player_espn_id, team_espn_id, categories,
       pts_avg, reb_avg, ast_avg, passing_yards, rushing_yards, receiving_yards, goals, assists, games_played, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     on conflict (league, season, player_espn_id) do update set
       team_espn_id = excluded.team_espn_id, categories = excluded.categories,
       pts_avg = excluded.pts_avg, reb_avg = excluded.reb_avg, ast_avg = excluded.ast_avg,
       passing_yards = excluded.passing_yards, rushing_yards = excluded.rushing_yards,
       receiving_yards = excluded.receiving_yards, goals = excluded.goals, assists = excluded.assists,
       games_played = excluded.games_played, updated_at = now()`,
    [league, seasonYear, playerEspnId, teamEspnId, JSON.stringify(out), ptsAvg, rebAvg, astAvg, passingYards, rushingYards, receivingYards, goals, assists, gamesPlayed]
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
  const categories: any[] = data.categories;
  // NBA: one more request for the postseason line (seasontype=3), for a player whose regular-season response HAS categories. Then
  // a response that is not a real answer (no categories array, no seasontype filter: an error body `getJson` parsed anyway) throws,
  // which fails the player's whole update instead of rewriting the stored row without the `postseason_*` keys a previous run
  // stored (`categories = excluded.categories`).
  const postseasonCategories = league === "nba" ? postseasonCategoriesOf(await fetchAthleteSeasonStats(league, playerEspnId, 3)) : [];
  // An explicit `yearsBack` is a relative window; the default is the league's pinned start (seasonWindowStart).
  const currentYear = new Date().getUTCFullYear();
  const minYear = yearsBack === undefined ? seasonWindowStart(league, currentYear) : currentYear - yearsBack;
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
