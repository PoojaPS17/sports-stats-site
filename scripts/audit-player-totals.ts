// Read-only acceptance audit: are the site's regular-season totals for every NBA / NFL player the
// same as ESPN's own headline numbers? ESPN's athlete /stats counts regular-season games only, so
// the site's `regular` profile (buildStagedProfile) must equal it: games played for both leagues,
// points per game for the NBA, passing / rushing / receiving yards and touchdowns for the NFL.
//
//   tsx scripts/audit-player-totals.ts [nba|nfl] [--live N] [--limit N] [--strict] [--gamelog]
//
// Default: compare against the season rows the loader stored in player_season_stats.
// --live N: pick N random players and read ESPN's athlete /stats now, so a stale or wrongly
//           stored row cannot hide (or invent) a difference.
// --limit N: cap the players per league (lowest ESPN ids first).
// --gamelog: NBA, for every season the page shows from ESPN's own season row (a season the box scores are
//           short of, where the row matches by construction and proves nothing), fetch ESPN's athlete game
//           log (one request per season, 150 ms apart) and check it against that row: the games played and
//           the points summed from the log against the row's GP and PTS. confirmed, ESPN internal (the two
//           differ by up to 3 games and by what those games could hold: the game log lists the All-Star Game;
//           listed, never fails) or MISMATCH. Never runs unless asked; honours --limit.
// Exits 1 when any season is a MISMATCH (or a live read failed; with --gamelog, a game log that is a MISMATCH
// or could not be read), 2 on bad arguments. Listed but not
// failing: coverage gaps (ESPN has the season, no regular-season box scores), "no ESPN row" (stored
// mode; live mode treats it as a MISMATCH inside the loader's window), "games not verified" (ESPN
// gives no games played), NFL "games short (no stat line)" (the page shows the logged count, with a
// `*`, because no ESPN games figure is stored for the season; site games below ESPN's, every figure
// equal), NBA "partial (no box score)" (a box-only season: ESPN published no box score for some of the
// team's games, so its GP and PPG cover games the site's average cannot; the games figure matches ESPN's or
// our listed count is within 2 of it, and ESPN's points total is at least the recorded points; nothing says
// what the missing games scored, so the average is not checked further, and the page labels these seasons as
// partial), and, in stored mode, NBA "ESPN row unusable" (ESPN counts more games than the database has box
// scores for, but its stored row fails its own points identity or a made-attempted pair, so the page cannot
// show it and falls back to the box-derived line). --strict makes "games not verified" and "games short" fail
// too, and never the partial class: a real mismatch, ESPN's total below the recorded points included, fails
// the run either way.
//
// NFL games: the site side is the page's own figure (the regular profile is built with the stored ESPN
// games map, as the player page does: ESPN's games played where stored, else the logged count). The
// ESPN side is the loader's figure, not the first-stint category GP: player_season_stats.games_played
// (stored mode) or seasonGamesPlayed on the payload (live mode), the categories' GP only as a fallback.
// A page showing a stored ESPN figure that is below ESPN's is a MISMATCH (stale or wrong), as is any
// page figure above ESPN's. NBA: the site side is built the same way (ESPN's stored games played for a
// season with games that have no box score, else the games listed); see compareSeason for the bounds.
//
// `select` only. The database is imported after the arguments are validated, so a usage error never
// opens a connection. The live read uses the loader's own row selection (season-row.ts, pure).
import {
  compareSeason,
  espnFigures,
  gamesPlayedFromPayload,
  parseArgs,
  seasonsFromPayload,
  siteSeasonOrEmpty,
  siteSeasons,
  tradedSeasons,
  unusableEspnRow,
  USAGE,
  type AuditLeague,
  type Difference,
  type EspnCategory,
  type StoredCategories,
} from "./lib/audit-player-totals";
import { classifyGamelog, gamelogRegularSeason, type GamelogSeason } from "./lib/espn-gamelog";
import { seasonRow, seasonWindowStart } from "./lib/season-row";
import { fetchEspnSeasons, fetchPlayerLog, fetchReportedGames } from "../src/lib/playerLog";
import { buildStagedProfile, playerSport } from "../src/lib/playerProfile";

const LIVE_PAUSE_MS = 150;
const GAMELOG_PAUSE_MS = 150;
const GAMELOG_TIMEOUT_MS = 20_000;
const MISMATCHES_SHOWN = 50;
const GAPS_SHOWN = 20;

interface Finding {
  league: AuditLeague;
  playerId: string;
  name: string;
  season: number;
  siteGames: number;
  differences: Difference[];
  /** Stored mode, and the player's regular-season games span several teams that season. */
  traded: boolean;
  /** "partial (no box score)" and "ESPN row unusable": ESPN's games played; for the former also `recorded`, the
   * games of them with a stat line. */
  espnGames?: number;
  recorded?: number;
}

/** A season shown from ESPN's own row whose game log is not the row: both sides' games and points. */
interface GamelogFinding {
  league: AuditLeague;
  playerId: string;
  name: string;
  season: number;
  gamelog: GamelogSeason;
  espnGames: number;
  espnPoints: number;
}

const TRADED_NOTE = "traded: stored row is one stint";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (v: number | null) => (v === null ? "none" : String(v));

/** ESPN's athlete game log for one NBA season (season year = the ending year, as everywhere else here). Throws on
 * any failed request (a 403, a 5xx, a timeout, a body that is not JSON): the caller reports it, never counts it as
 * confirmed. The headers are those of the other ESPN fetches (scripts/lib/espn.ts): JSON accepted, the runtime's
 * own User-Agent. */
async function fetchGamelog(playerEspnId: string, season: number): Promise<unknown> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(playerEspnId)}/gamelog?season=${season}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(GAMELOG_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ESPN game log request failed (${res.status}): ${url}`);
  return res.json();
}

function sample<T>(items: T[], n: number): T[] {
  const pool = [...items];
  for (let i = 0; i < Math.min(n, pool.length); i += 1) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`[audit-player-totals] ${args.error}\n${USAGE}`);
    process.exit(2);
  }
  const { pool } = await import("./lib/db");
  const { fetchAthleteSeasonStats } = await import("./lib/espn");
  if (args.gamelog && !args.leagues.includes("nba")) console.log("[audit-player-totals] --gamelog checks NBA seasons only; nothing to fetch for nfl");
  const mode = args.live ? `live (${args.live} random players per league, read from ESPN now)` : "stored player_season_stats rows";
  console.log(`[audit-player-totals] ${args.leagues.join(", ")}: comparing the site's regular-season totals with ESPN, ${mode}`);

  const mismatches: Finding[] = [];
  const gaps: Finding[] = [];
  const noEspn: Finding[] = [];
  const unverified: Finding[] = [];
  const short: Finding[] = [];
  const partial: Finding[] = [];
  const unusable: Finding[] = [];
  const failures: string[] = [];
  let gamelogChecked = 0;
  let gamelogConfirmed = 0;
  const gamelogInternal: GamelogFinding[] = [];
  const gamelogMismatches: GamelogFinding[] = [];
  const gamelogFailures: string[] = [];
  let compared = 0;
  let matched = 0;
  let nothing = 0;

  try {
    for (const league of args.leagues) {
      const sport = playerSport(league);
      if (!sport) throw new Error(`no player profile for ${league}`);
      const minYear = seasonWindowStart(league, new Date().getUTCFullYear());
      const { rows: everyone } = await pool.query<{ id: string; name: string }>(
        `select pgs.player_espn_id as id, coalesce(max(p.name), pgs.player_espn_id) as name
         from player_game_stats pgs
         left join players p on p.league = pgs.league and p.espn_id = pgs.player_espn_id
         where pgs.league = $1
         group by pgs.player_espn_id
         order by pgs.player_espn_id
         limit $2::int`,
        [league, args.limit]
      );
      const players = args.live ? sample(everyone, args.live) : everyone;
      console.log(`[audit-player-totals] ${league}: ${players.length} players${args.live ? ` sampled from ${everyone.length} with box scores` : " with box scores"}`);

      for (const player of players) {
        try {
          const log = await fetchPlayerLog(pool, league, player.id);
          // The page's own build: with ESPN's stored games played per season (NFL; NBA seasons with games that have no box score)
          // and, for the NBA, ESPN's stored season line where the game rows are short of it.
          const espnSeasons = await fetchEspnSeasons(pool, league, player.id);
          const regular = buildStagedProfile(sport, log, await fetchReportedGames(pool, league, player.id), espnSeasons).regular;
          const site = siteSeasons(sport, regular);
          const traded = args.live ? new Set<number>() : tradedSeasons(regular);

          // Per season: ESPN's categories, and the games figure the loader has (or would store) for it.
          let espn: Map<number, StoredCategories>;
          let espnGames: Map<number, number | null>;
          if (args.live) {
            const data = await fetchAthleteSeasonStats(league, player.id);
            const payload = (data.categories ?? []) as EspnCategory[];
            espn = seasonsFromPayload(payload, seasonRow, minYear);
            espnGames = gamesPlayedFromPayload(payload, minYear);
          } else {
            const { rows } = await pool.query<{ season: number; categories: StoredCategories; games_played: number | null }>(
              `select season, categories, games_played from player_season_stats where league = $1 and player_espn_id = $2`,
              [league, player.id]
            );
            espn = new Map(rows.map((r) => [r.season, r.categories]));
            espnGames = new Map(rows.map((r) => [r.season, r.games_played]));
          }

          // Stored mode, NBA: ESPN counts more games than the database has logged, but its row is one the page cannot use.
          if (!args.live && league === "nba") {
            const loggedBySeason = new Map(regular.seasons.map((s) => [s.season, s.recorded]));
            for (const [season, categories] of espn) {
              const logged = loggedBySeason.get(season) ?? 0;
              if (!unusableEspnRow(categories, logged)) continue;
              unusable.push({ league, playerId: player.id, name: player.name, season, siteGames: logged, differences: [], traded: traded.has(season), espnGames: espnFigures(league, categories)?.games ?? 0 });
            }
          }

          const seasons = [...new Set([...site.keys(), ...espn.keys()])].sort((a, b) => a - b);
          for (const season of seasons) {
            const siteLine = siteSeasonOrEmpty(site, season);
            const stored = espn.get(season);
            const espnLine = stored ? espnFigures(league, stored, espnGames.get(season)) : null;
            // Live, inside the loader's window: ESPN is authoritative, so a season it has no row for is a mismatch.
            const result = compareSeason(siteLine, espnLine, { league, requireEspnRow: Boolean(args.live) && season >= minYear });
            const finding: Finding = { league, playerId: player.id, name: player.name, season, siteGames: siteLine.games ?? 0, differences: result.differences, traded: traded.has(season) };
            if (result.verdict === "match") {
              compared += 1;
              matched += 1;
            } else if (result.verdict === "MISMATCH") {
              // A season that is a mismatch only for want of an ESPN row was not compared figure by figure.
              if (result.differences[0]?.field !== "ESPN row") compared += 1;
              mismatches.push(finding);
            } else if (result.verdict === "no box scores") {
              gaps.push(finding);
            } else if (result.verdict === "no ESPN row") {
              noEspn.push(finding);
            } else if (result.verdict === "games not verified") {
              unverified.push(finding);
            } else if (result.verdict === "games short (no stat line)") {
              short.push(finding);
            } else if (result.verdict === "partial (no box score)") {
              // Both sides have the season, but it is not a match: the average cannot be checked past the lower bound.
              compared += 1;
              partial.push({ ...finding, espnGames: espnLine?.games ?? 0, recorded: siteLine.noBoxScore?.recorded ?? 0 });
            } else {
              nothing += 1;
            }
          }

          // --gamelog: a season shown from ESPN's own row matches it by construction; ESPN's game log is the independent check.
          if (args.gamelog && league === "nba") {
            for (const season of regular.seasons) {
              if (season.lineSource !== "espn") continue;
              const label = `${league} ${player.id} ${player.name} ${season.season}`;
              const totals = espnSeasons.get(season.season);
              if (!totals) {
                gamelogFailures.push(`${label}: no usable ESPN season row to check the game log against`);
                continue;
              }
              try {
                const gamelog = gamelogRegularSeason(await fetchGamelog(player.id, season.season));
                if (!gamelog) throw new Error("the response is not a game log (no minutes or points column)");
                gamelogChecked += 1;
                const verdict = classifyGamelog(gamelog, totals);
                const found: GamelogFinding = { league, playerId: player.id, name: player.name, season: season.season, gamelog, espnGames: totals.games, espnPoints: totals.pts };
                if (verdict === "confirmed") gamelogConfirmed += 1;
                else if (verdict === "ESPN internal") gamelogInternal.push(found);
                else gamelogMismatches.push(found);
              } catch (err) {
                gamelogFailures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
              }
              await sleep(GAMELOG_PAUSE_MS);
            }
          }
        } catch (err) {
          failures.push(`${league} ${player.id} ${player.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (args.live) await sleep(LIVE_PAUSE_MS);
      }
    }
  } finally {
    await pool.end();
  }

  const note = (f: Finding) => (f.traded ? `  [${TRADED_NOTE}]` : "");
  const gapOf = (f: Finding) => (f.differences[0]?.espn ?? 0) - (f.differences[0]?.site ?? 0);
  const boxlessOf = (f: Finding) => (f.espnGames ?? 0) - (f.recorded ?? 0);

  console.log("\n[audit-player-totals] summary");
  console.log(`  compared:                   ${compared} player-seasons (site and ESPN both have the season)`);
  console.log(`  matched:                    ${matched}`);
  console.log(`  mismatched:                 ${mismatches.length}   (fails the run)`);
  console.log(`  coverage gaps:              ${gaps.length}   (ESPN has the season, the database has no regular-season box scores; never a match)`);
  console.log(`  no ESPN row:                ${noEspn.length}   (the site has regular-season games, ESPN has no row; ${args.live ? "outside the loader's window only, inside it is a mismatch" : "stored rows exist only for current-roster players"})`);
  console.log(`  games not verified:         ${unverified.length}   (every figure agrees but ESPN gives no games played${args.strict ? "; --strict: fails the run" : ""})`);
  console.log(`  games short (no stat line): ${short.length}   (NFL: the page shows the logged count because no ESPN games figure is stored for the season; every figure equal${args.strict ? "; --strict: fails the run" : ""})`);
  console.log(`  partial (no box score):     ${partial.length}   (box-only season: ESPN published no box score for some of the team's games; the games figure matches ESPN or is within 2, ESPN's points total is at least the recorded points, the average is not checked further; labelled as partial on the page; never fails the run)`);
  if (!args.live && args.leagues.includes("nba")) {
    console.log(`  ESPN row unusable:          ${unusable.length}   (NBA: ESPN counts more games than the database has logged but its stored row fails its own points identity or a made-attempted pair, so the page shows the box-derived line; informational, never fails the run)`);
  }
  console.log(`  nothing to compare:         ${nothing}   (neither side has anything for the season)`);
  if (!args.live && args.leagues.includes("nfl")) {
    console.log("  Note: in stored mode an NFL season with a stored games figure matches on games by construction (the page and this audit read the same column); only --live checks that figure against ESPN.");
  }
  if (args.gamelog && args.leagues.includes("nba")) {
    console.log(`  game log (--gamelog):       ${gamelogChecked} seasons shown from ESPN's own row checked: ${gamelogConfirmed} confirmed, ${gamelogInternal.length} ESPN internal (listed, never fails), ${gamelogMismatches.length} MISMATCH (fails the run)`);
    if (gamelogFailures.length > 0) console.log(`  game logs not read:         ${gamelogFailures.length}   (not verified; fails the run)`);
  }
  if (failures.length > 0) console.log(`  failed reads:               ${failures.length}   (fails the run)`);

  if (mismatches.length > 0) {
    console.log(`\n[audit-player-totals] MISMATCH (first ${Math.min(MISMATCHES_SHOWN, mismatches.length)} of ${mismatches.length})`);
    for (const m of mismatches.slice(0, MISMATCHES_SHOWN)) {
      const what = m.differences.map((d) => `${d.field} site ${fmt(d.site)} / ESPN ${fmt(d.espn)}`).join("; ");
      console.log(`  ${m.league} ${m.playerId} ${m.name} ${m.season}: ${what}${note(m)}`);
    }
    if (!args.live) {
      console.log("  Note: for a player who changed teams mid-season the stored row can be the first team's stint only; re-check those with --live.");
    }
  }

  section("coverage gaps (box scores not backfilled for that season yet?)", "players", gaps, () => 1, (f) => `${f.league} ${f.playerId} ${f.name} ${f.season}`);
  section("no ESPN row", "site games", noEspn, (f) => f.siteGames, (f) => `${f.league} ${f.playerId} ${f.name} ${f.season}: ${f.siteGames} site games${note(f)}`);
  section("games not verified (ESPN gives no games played)", "site games", unverified, (f) => f.siteGames, (f) => `${f.league} ${f.playerId} ${f.name} ${f.season}: ${f.siteGames} site games${note(f)}`);
  section("games short (no stat line)", "games short", short, gapOf, (f) => `${f.league} ${f.playerId} ${f.name} ${f.season}: site ${f.differences[0]?.site} / ESPN ${f.differences[0]?.espn} games, ${gapOf(f)} short${note(f)}`);

  section(
    "partial: ESPN published no box score for some of the team's games (box-only seasons)",
    "games without a box score",
    partial,
    boxlessOf,
    (f) => {
      const ppg = f.differences.find((d) => d.field === "ppg");
      return `${f.league} ${f.playerId} ${f.name} ${f.season}: ESPN ${f.espnGames} games, ${f.recorded} with a box score, ${boxlessOf(f)} without; ppg site ${fmt(ppg?.site ?? null)} / ESPN ${fmt(ppg?.espn ?? null)}${note(f)}`;
    }
  );

  if (unusable.length > 0) {
    console.log(`\n[audit-player-totals] ESPN row unusable (${unusable.length}): ESPN counts more games than the database has logged, but its stored row fails its own identity; not a failure`);
    for (const f of unusable) console.log(`  ${f.league} ${f.playerId} ${f.name} ${f.season}: ESPN ${f.espnGames} games, ${f.siteGames} logged${note(f)}`);
  }

  const gamelogLine = (g: GamelogFinding) => `${g.league} ${g.playerId} ${g.name} ${g.season}: game log ${g.gamelog.games} games / ${g.gamelog.points} points, ESPN season row ${g.espnGames} games / ${g.espnPoints} points`;
  if (gamelogMismatches.length > 0) {
    console.log(`\n[audit-player-totals] game log MISMATCH (${gamelogMismatches.length}): ESPN's game log and its own season row disagree beyond what a few games explain`);
    for (const g of gamelogMismatches) console.log(`  ${gamelogLine(g)}`);
  }
  if (gamelogInternal.length > 0) {
    console.log(`\n[audit-player-totals] game log ESPN internal (${gamelogInternal.length}): within 3 games of ESPN's own season row (its game log also lists the All-Star Game); not a failure`);
    for (const g of gamelogInternal) console.log(`  ${gamelogLine(g)}`);
  }
  if (gamelogFailures.length > 0) {
    console.log(`\n[audit-player-totals] game logs that could not be read (not verified, ${gamelogFailures.length})`);
    for (const f of gamelogFailures) console.log(`  ${f}`);
  }

  if (failures.length > 0) {
    console.log("\n[audit-player-totals] players that could not be read (not verified)");
    for (const f of failures.slice(0, MISMATCHES_SHOWN)) console.log(`  ${f}`);
  }

  const strictFailures = args.strict ? unverified.length + short.length : 0;
  const gamelogFailed = gamelogMismatches.length > 0 || gamelogFailures.length > 0;
  process.exit(mismatches.length > 0 || failures.length > 0 || strictFailures > 0 || gamelogFailed ? 1 : 0);
}

// One listing for a class that is reported but does not fail: a per-season table, then the first few players.
function section(title: string, unit: string, findings: Finding[], measure: (f: Finding) => number, describe: (f: Finding) => string) {
  if (findings.length === 0) return;
  const bySeason = new Map<string, { count: number; total: number }>();
  for (const f of findings) {
    const key = `${f.league} ${f.season}`;
    const entry = bySeason.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += measure(f);
    bySeason.set(key, entry);
  }
  console.log(`\n[audit-player-totals] ${title}: ${findings.length} player-seasons, by season`);
  for (const [key, { count, total }] of [...bySeason.entries()].sort()) console.log(`  ${key}: ${count} players, ${total} ${unit}`);
  console.log(`  first ${Math.min(GAPS_SHOWN, findings.length)}:`);
  for (const f of findings.slice(0, GAPS_SHOWN)) console.log(`  ${describe(f)}`);
}

main().catch((err) => {
  console.error("[audit-player-totals] failed:", err);
  process.exit(1);
});
