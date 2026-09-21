// The league leader boards (Leaders page, off-season recap cards).
//
// Where a season's figures come from, one rule per (league, season):
//   * NBA, NFL and the domestic soccer leagues: when the season has stored box scores (a completed regular-season game
//     with player rows) the board is summed from them at read time, over the same rows the player pages sum, so a board
//     and a player page can never disagree and a board is as fresh as the last stored game. ESPN's athlete totals
//     (player_season_stats) lag the box scores by up to a day and are refreshed by the daily job only.
//     Finished seasons follow the same rule: the player page is the site's figure, and ESPN's final row is used only where
//     the page itself uses it (below). Where the two differ (ESPN's own totals disagree with its game log, a few games
//     with no stored box score) the board follows the page.
//   * NBA exception, per player: where ESPN counts more games than the box scores hold (it published no box score for
//     some games, see the audit notes on the Bulls and Pelicans 2015-2018) and the row passes the page's guards, the
//     player's figure is ESPN's own season row, exactly as on his page (`usesEspnSeasonLine`). A player with a stored ESPN row
//     and no box-score rows of his own has no season on his page, so he is on no board (and is not counted in the 70% rule).
//   * The box-score rows are the page's rows: the same two joins on `teams` as `fetchPlayerLog`, so a row the page drops
//     (club or opponent not in `teams`, no club) is not summed either.
//   * A season with no stored box scores (before the box-score history starts, or the cup and cricket leagues whose
//     boards are built elsewhere) keeps ESPN's stored rows: player_season_stats. UCL is such a league on purpose: its
//     season rows are themselves rebuilt from box scores (scripts/lib/boxscore-season-stats.ts) and stay as they are.
//     Cricket boards are `getCricketLeaders`, untouched.
// The club shown is the club (or, for a traded player, the clubs joined by " / ") of the season's own rows, never the
// player's current club, which is what the loader writes into every stored season row.
import { pool } from "./db";
import { espnSeasonTotals, type EspnSeasonTotals } from "./espnSeason";
import { isCupCompetition, type League } from "./leagues";
import { nbaPerGame, nbaQualifyingGames, orderLeaders, rankLeaders, roundLeaderAverage, seasonTeams, takeLeaders, teamsLabel, type NbaStat, type Rankable, type TeamStint } from "./leaders";
import { noStatLineGameSql } from "./playerLog";
import { playerSport, type PlayerSport } from "./playerProfile";
import { notPseudoAthleteSql } from "./pseudoAthlete";
import type { LeaderRow } from "./queries";

export interface LeaderBoard {
  rows: LeaderRow[];
  /** Players tied at the cutoff that the row cap left off (0 when every tied player is listed). */
  omitted: number;
}

type BoxColumn =
  | { sport: "soccer"; key: "goals" | "assists"; secondary: "goals" | "assists" }
  | { sport: "nfl"; category: "passing" | "rushing" | "receiving" }
  | { sport: "nba"; stat: NbaStat };

// Every leader column: how a box-score board reads it. The keys are also the player_season_stats columns (the fallback source).
const BOX_COLUMNS: Record<string, BoxColumn> = {
  goals: { sport: "soccer", key: "goals", secondary: "assists" },
  assists: { sport: "soccer", key: "assists", secondary: "goals" },
  passing_yards: { sport: "nfl", category: "passing" },
  rushing_yards: { sport: "nfl", category: "rushing" },
  receiving_yards: { sport: "nfl", category: "receiving" },
  pts_avg: { sport: "nba", stat: "pts" },
  reb_avg: { sport: "nba", stat: "reb" },
  ast_avg: { sport: "nba", stat: "ast" },
};

/** The most recent season a board can show: the latest season with a stored ESPN figure, or, for the leagues whose boards
 * are summed from box scores, the latest with a completed regular-season game that has box scores (so a new season's
 * board appears with its first game, not with the next daily job). */
export async function getLeadersSeason(league: League): Promise<number | null> {
  // Only a stored season with a figure in some board column counts: ESPN can already hold next season's rows for a player
  // (the loader writes every column as null for a season with no games), and that season has no board to show.
  const { rows } = await pool.query(
    `select max(season) as season from player_season_stats
     where league = $1 and (${Object.keys(BOX_COLUMNS).map((c) => `${c} is not null`).join(" or ")})`,
    [league]
  );
  const stored: number | null = rows[0]?.season ?? null;
  if (isCupCompetition(league) || playerSport(league) === null) return stored;
  const { rows: box } = await pool.query(
    `select g.season_year from games g
     where g.league = $1 and g.season_year is not null and g.completed and g.stage in ('regular', 'other')
       and exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)
     order by g.season_year desc limit 1`,
    [league]
  );
  const summed: number | null = box[0]?.season_year ?? null;
  return stored === null ? summed : summed === null ? stored : Math.max(stored, summed);
}

export async function getLeaderBoard(league: League, column: string, opts: { limit?: number; season?: number; ties?: boolean } = {}): Promise<LeaderBoard> {
  if (!Object.prototype.hasOwnProperty.call(BOX_COLUMNS, column)) throw new Error(`Unknown leader column: ${column}`);
  const limit = opts.limit ?? 10;
  const ties = opts.ties ?? false;
  const season = opts.season ?? (await getLeadersSeason(league));
  if (season === null) return { rows: [], omitted: 0 };
  const spec = BOX_COLUMNS[column];
  if (!isCupCompetition(league) && spec.sport === playerSport(league)) {
    const summed = spec.sport === "nba" ? await nbaBoard(league, season, spec.stat, limit, ties) : await totalsBoard(league, season, spec, limit, ties);
    // null: the season has no stored box scores (before the history starts), so ESPN's stored rows are the source.
    if (summed !== null) return summed;
  }
  return storedBoard(league, season, column, limit, ties);
}

// ---------------------------------------------------------------------------
// Stored rows (ESPN's athlete totals): the source for seasons with no box scores and for UCL.
// ---------------------------------------------------------------------------
async function storedBoard(league: League, season: number, column: string, limit: number, ties: boolean): Promise<LeaderBoard> {
  // A per-game average is only a leader-board figure once the player has played a
  // qualifying share of the season (the NBA's own rule is 70% of games, 58 of 82):
  // without it a ten-game injury season outranks a full one. The threshold follows
  // the most games anyone has played so far, so it tracks the season as it goes.
  const qualifier = column.endsWith("_avg")
    ? `and pss.games_played >= ceil(0.7 * (select max(games_played) from player_season_stats q where q.league = pss.league and q.season = pss.season))`
    : "";
  const secondary = column === "goals" ? "pss.assists" : column === "assists" ? "pss.goals" : "null";
  // Ranked over every stored row BEFORE the join to `players`, so a top row with no players row (which cannot be shown) leaves
  // the others their own ranks instead of promoting the next player to 1: a hole is fine, a wrong rank is not.
  const { rows } = await pool.query(
    `select x.player_espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url,
            t.name as team_name, t.slug as team_slug, x.value, x.secondary, x.rk
     from (
       select pss.player_espn_id, pss.team_espn_id, pss.${column} as value, ${secondary} as secondary,
              rank() over (order by pss.${column} desc) as rk
       from player_season_stats pss
       where pss.league = $1 and pss.${column} > 0 and ${notPseudoAthleteSql("pss.player_espn_id")}
         and pss.season = $3
         ${qualifier}
     ) x
     join players p on p.league = $1 and p.espn_id = x.player_espn_id
     left join teams t on t.league = $1 and t.espn_id = x.team_espn_id
     where x.rk <= $2`,
    [league, limit, season]
  );
  // Best first with real names for equal figures, each row keeping the rank the whole standing gave it.
  const ranked = orderLeaders(rows.map((r) => ({ ...r, value: Number(r.value), secondary: r.secondary === null ? null : Number(r.secondary), rank: Number(r.rk) })));
  const picked = takeLeaders(ranked, limit, { ties });
  return {
    rows: picked.rows.map((r): LeaderRow => ({ player_espn_id: r.player_espn_id, name: r.name, slug: r.slug, headshot_url: r.headshot_url, team_name: r.team_name, team_slug: r.team_slug, value: r.value, rank: r.rank })),
    omitted: picked.omitted,
  };
}

// ---------------------------------------------------------------------------
// Box scores
// ---------------------------------------------------------------------------

// A box-score cell as a number, or null when it is not one: the SQL twin of `cell()` in playerProfile.ts for a plain figure.
const asNumber = (raw: string) => `(case when ${raw} ~ '^-?[0-9]+(\\.[0-9]+)?$' then (${raw})::numeric end)`;

/** The figures summed per player and club, per sport: every board of the sport reads its own from one query. */
const MEASURES: Record<PlayerSport, { key: string; category: string; label: string }[]> = {
  soccer: [{ key: "goals", category: "match", label: "G" }, { key: "assists", category: "match", label: "A" }],
  nfl: [
    { key: "passing", category: "passing", label: "YDS" },
    { key: "rushing", category: "rushing", label: "YDS" },
    { key: "receiving", category: "receiving", label: "YDS" },
  ],
  nba: [{ key: "pts", category: "box", label: "PTS" }, { key: "reb", category: "box", label: "REB" }, { key: "ast", category: "box", label: "AST" }],
};

/** SQL twin of each sport's `played` test in playerProfile.ts, over the raw cells of a row (`r`): a soccer
 * appearance, an NBA row with a numeric MIN or points, every NFL row. (The sitemap keeps the same twin for its own query.) */
function playedSql(sport: PlayerSport): string {
  if (sport === "soccer") return `${asNumber("r.raw_app")} = 1`;
  if (sport === "nba") return `(coalesce(r.raw_min, '') ~ '^[0-9]+([.][0-9]+)?$' or coalesce(${asNumber("r.raw_pts")}, 0) > 0)`;
  return "true";
}

interface Stint {
  player_espn_id: string;
  team_espn_id: string;
  first_date: Date;
  /** Rows that count as an appearance (the page's `played`). */
  logged: number;
  /** NBA: rows in games ESPN published no box score for (nobody has a stat line), which the page lists as games with no line. */
  unrecorded: number;
  /** Per measure key (see MEASURES): the figure summed over the counted rows, and how many of them had one. */
  sum: Record<string, number>;
  n: Record<string, number>;
}

const inFlight = new Map<string, Promise<Stint[]>>();

/** One row per player and club for the season's completed regular-season games (the stage the player page's regular
 * table sums): the counted rows' figures and the date of the first one. The Leaders page asks for a sport's boards at
 * once, so concurrent callers for the same season share one query. */
function seasonStints(league: League, season: number, sport: PlayerSport): Promise<Stint[]> {
  const key = `${league}:${season}`;
  const running = inFlight.get(key);
  if (running) return running;
  const promise = loadSeasonStints(league, season, sport).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function loadSeasonStints(league: League, season: number, sport: PlayerSport): Promise<Stint[]> {
  // The season's games first (games_league_season_idx), then their rows by the primary key (league, game_espn_id): the
  // cost follows the season, not the league's whole history in player_game_stats.
  const { rows: games } = await pool.query(`select espn_id, date, home_team_espn_id as home, away_team_espn_id as away from games where league = $1 and season_year = $2 and completed and stage in ('regular', 'other')`, [league, season]);
  if (games.length === 0) return [];
  const measures = MEASURES[sport];
  const raw = [
    ...measures.map((m) => `s.stats->'${m.category}'->>'${m.label}' as raw_${m.key}`),
    ...(sport === "soccer" ? [`s.stats->'match'->>'APP' as raw_app`] : []),
    ...(sport === "nba" ? [`s.stats->'box'->>'MIN' as raw_min`] : []),
  ];
  const aggregates = measures.map((m) => `coalesce(sum(${asNumber(`x.raw_${m.key}`)}) filter (where x.played), 0) as sum_${m.key}, count(${asNumber(`x.raw_${m.key}`)}) filter (where x.played)::int as n_${m.key}`);
  // The two joins on `teams` are the player page's own (fetchPlayerLog): a row whose club, or whose game's opponent, is not in
  // `teams` never reaches a page, so it is on no board either.
  // `offset 0` keeps each row's cells and its played / nobox tests computed once instead of inlined into every aggregate.
  const { rows } = await pool.query(
    `select x.player_espn_id, x.team_espn_id,
            min(x.date) filter (where x.played or x.nobox) as first_date,
            count(*) filter (where x.played)::int as logged,
            count(*) filter (where x.nobox)::int as unrecorded,
            ${aggregates.join(",\n            ")}
     from (
       select r.*, ${playedSql(sport)} as played,
              ${sport === "nba" ? `(case when ${playedSql(sport)} then false else ${noStatLineGameSql("r")} end)` : "false"} as nobox
       from (
         select s.league, s.game_espn_id, s.player_espn_id, s.team_espn_id, g.date, ${raw.join(", ")}
         from player_game_stats s
         join unnest($2::text[], $3::timestamptz[], $4::text[], $5::text[]) as g(espn_id, date, home, away) on g.espn_id = s.game_espn_id
         join teams tm on tm.league = s.league and tm.espn_id = s.team_espn_id
         join teams op on op.league = s.league and op.espn_id = case when g.home = s.team_espn_id then g.away else g.home end
         where s.league = $1 and s.game_espn_id = any($2) and ${notPseudoAthleteSql("s.player_espn_id")}
         offset 0
       ) r
       offset 0
     ) x
     group by x.player_espn_id, x.team_espn_id
     having count(*) filter (where x.played or x.nobox) > 0`,
    [league, games.map((g) => g.espn_id), games.map((g) => g.date), games.map((g) => g.home), games.map((g) => g.away)]
  );
  return rows.map((r) => ({
    player_espn_id: r.player_espn_id,
    team_espn_id: r.team_espn_id,
    first_date: r.first_date,
    logged: r.logged,
    unrecorded: r.unrecorded,
    sum: Object.fromEntries(measures.map((m) => [m.key, Number(r[`sum_${m.key}`])])),
    n: Object.fromEntries(measures.map((m) => [m.key, Number(r[`n_${m.key}`])])),
  }));
}

interface Candidate extends Rankable {
  stints: Stint[];
}

const byPlayer = (stints: Stint[]) => {
  const map = new Map<string, Stint[]>();
  for (const s of stints) map.set(s.player_espn_id, [...(map.get(s.player_espn_id) ?? []), s]);
  return map;
};

const total = (stints: Stint[], pick: (s: Stint) => number) => stints.reduce((n, s) => n + pick(s), 0);

/** Soccer goals and assists, NFL yards: a player's total over the season's counted rows. */
async function totalsBoard(league: League, season: number, spec: Extract<BoxColumn, { sport: "soccer" | "nfl" }>, limit: number, ties: boolean): Promise<LeaderBoard | null> {
  const stints = await seasonStints(league, season, spec.sport);
  if (stints.length === 0) return null;
  const [key, secondaryKey] = spec.sport === "soccer" ? [spec.key, spec.secondary] : [spec.category, null];
  const candidates: Candidate[] = [...byPlayer(stints)].map(([id, ss]) => ({
    player_espn_id: id,
    name: "",
    value: total(ss, (s) => s.sum[key]),
    secondary: secondaryKey === null ? null : total(ss, (s) => s.sum[secondaryKey]),
    stints: ss,
  }));
  return hydrate(league, candidates, limit, ties);
}

/** NBA per-game averages: the box-score average, or ESPN's own season row for a player whose box scores are short,
 * for players with at least 70% of the games the most-played player has. */
async function nbaBoard(league: League, season: number, stat: NbaStat, limit: number, ties: boolean): Promise<LeaderBoard | null> {
  const stints = await seasonStints(league, season, "nba");
  if (stints.length === 0) return null;
  // Only a player with rows of his own has a season (and games) on his page; one with an ESPN row and no rows here has neither,
  // so he is on no board and does not count towards the games the 70% rule is taken from.
  const logged = byPlayer(stints);
  const { rows: stored } = await pool.query(`select player_espn_id, nullif(games_played, 0) as games_played from player_season_stats where league = $1 and season = $2 and player_espn_id = any($3)`, [league, season, [...logged.keys()]]);
  const storedGames = new Map<string, number>(stored.filter((r) => r.games_played !== null).map((r) => [r.player_espn_id as string, r.games_played as number]));
  // ESPN's whole row is read only for a player whose box scores it may outrun: the rest is all box.
  const needRow = stored.filter((r) => r.games_played === null || r.games_played > total(logged.get(r.player_espn_id) ?? [], (s) => s.logged)).map((r) => r.player_espn_id as string);
  const { rows: cats } = needRow.length
    ? await pool.query(`select player_espn_id, categories from player_season_stats where league = $1 and season = $2 and player_espn_id = any($3)`, [league, season, needRow])
    : { rows: [] as { player_espn_id: string; categories: unknown }[] };
  const espnBy = new Map<string, EspnSeasonTotals | null>(cats.map((r) => [r.player_espn_id, espnSeasonTotals(r.categories)]));

  const figures = [...logged].map(([id, ss]) => {
    const f = nbaPerGame(stat, {
      logged: total(ss, (s) => s.logged),
      unrecorded: total(ss, (s) => s.unrecorded),
      recordedPoints: total(ss, (s) => s.sum.pts),
      teams: ss.length,
      storedGames: storedGames.get(id) ?? null,
      espn: espnBy.get(id) ?? null,
      sum: total(ss, (s) => s.sum[stat]),
      n: total(ss, (s) => s.n[stat]),
    });
    return { id, ...f, stints: ss };
  });
  const needed = nbaQualifyingGames(Math.max(0, ...figures.map((f) => f.games)));
  const candidates: Candidate[] = figures
    .filter((f) => f.exact !== null && f.exact > 0 && f.games >= needed)
    .map((f) => ({ player_espn_id: f.id, name: "", value: roundLeaderAverage(f.exact!), secondary: f.exact, stints: f.stints }));
  return hydrate(league, candidates, limit, ties);
}

/** Names, headshots and the season's clubs for the players near the top, then the final order and ties. The ranks are those of
 * the whole standing (`rankLeaders`), kept when a player cannot be shown (no `players` row): the next player keeps his own
 * rank rather than being promoted. Only players whose rank is within `limit` are looked up (ties included), so the lookup
 * is a handful of rows. */
async function hydrate(league: League, candidates: Candidate[], limit: number, ties: boolean): Promise<LeaderBoard> {
  const near = rankLeaders(candidates).filter((r) => r.rank <= limit);
  if (near.length === 0) return { rows: [], omitted: 0 };
  const ids = near.map((r) => r.player_espn_id);
  const clubIds = [...new Set(near.flatMap((r) => r.stints.map((s) => s.team_espn_id)))];
  const [{ rows: people }, { rows: clubs }] = await Promise.all([
    pool.query(`select p.espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url from players p where p.league = $1 and p.espn_id = any($2) and ${notPseudoAthleteSql()}`, [league, ids]),
    pool.query(`select espn_id, name, slug from teams where league = $1 and espn_id = any($2)`, [league, clubIds]),
  ]);
  const person = new Map(people.map((p) => [p.espn_id as string, p]));
  const club = new Map(clubs.map((t) => [t.espn_id as string, t]));
  // Real names now, so equal figures order by name; each row keeps the rank it had in the full standing.
  const named = orderLeaders(near.filter((r) => person.has(r.player_espn_id)).map((r) => ({ ...r, name: person.get(r.player_espn_id).name as string })));
  const picked = takeLeaders(named, limit, { ties });
  return {
    rows: picked.rows.map((r): LeaderRow => {
      const p = person.get(r.player_espn_id);
      const teams = seasonTeams(r.stints.flatMap((s): TeamStint[] => (club.has(s.team_espn_id) ? [{ ...club.get(s.team_espn_id), first_date: s.first_date }] : [])));
      return {
        player_espn_id: r.player_espn_id,
        name: p.name,
        slug: p.slug,
        headshot_url: p.headshot_url,
        team_name: teamsLabel(teams),
        team_slug: teams.length > 0 ? teams[teams.length - 1].slug : null,
        value: r.value,
        rank: r.rank,
      };
    }),
    omitted: picked.omitted,
  };
}
