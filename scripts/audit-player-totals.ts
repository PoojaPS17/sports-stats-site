// Read-only acceptance audit: are the site's regular-season totals for every NBA / NFL player the
// same as ESPN's own headline numbers? ESPN's athlete /stats counts regular-season games only, so
// the site's `regular` profile (buildStagedProfile) must equal it: games played for both leagues,
// points per game for the NBA, passing / rushing / receiving yards and touchdowns for the NFL.
//
//   tsx scripts/audit-player-totals.ts [nba|nfl] [--live N] [--limit N]
//
// Default: compare against the season rows the loader stored in player_season_stats.
// --live N: pick N random players and read ESPN's athlete /stats now, so a stale or wrongly
//           stored row cannot hide (or invent) a difference.
// --limit N: cap the players per league (lowest ESPN ids first).
// Exits 1 when any season is a MISMATCH (or a live read failed), 2 on bad arguments. Listed but not
// failing: coverage gaps (ESPN has the season, no regular-season box scores), "no ESPN row" (stored
// mode; live mode treats it as a MISMATCH inside the loader's window), "games not verified" (ESPN
// gives no games played), NFL "games short (no stat line)" (the page shows the logged count, with a
// `*`, because no ESPN games figure is stored for the season; site games below ESPN's, every figure
// equal), NBA "explained (no box score)" (ESPN published no box score for some of the team's games,
// so its GP and PPG cover games the site's average cannot; the games figure matches ESPN's or our
// listed count is within 2 of it, and the average is inside what those games could hold). --strict
// makes "games not verified" and "games short" fail too, and never the explained class: a real
// mismatch, an average outside those bounds included, fails the run either way.
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
  USAGE,
  type AuditLeague,
  type Difference,
  type EspnCategory,
  type StoredCategories,
} from "./lib/audit-player-totals";
import { SEASON_YEARS_BACK, seasonRow } from "./lib/season-row";
import { fetchPlayerLog, fetchReportedGames } from "../src/lib/playerLog";
import { buildStagedProfile, playerSport } from "../src/lib/playerProfile";

const LIVE_PAUSE_MS = 150;
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
  /** "explained (no box score)" only: ESPN's games played, and the games of them with a stat line. */
  espnGames?: number;
  recorded?: number;
}

const TRADED_NOTE = "traded: stored row is one stint";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (v: number | null) => (v === null ? "none" : String(v));

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
  const mode = args.live ? `live (${args.live} random players per league, read from ESPN now)` : "stored player_season_stats rows";
  console.log(`[audit-player-totals] ${args.leagues.join(", ")}: comparing the site's regular-season totals with ESPN, ${mode}`);

  const mismatches: Finding[] = [];
  const gaps: Finding[] = [];
  const noEspn: Finding[] = [];
  const unverified: Finding[] = [];
  const short: Finding[] = [];
  const explained: Finding[] = [];
  const failures: string[] = [];
  let compared = 0;
  let matched = 0;
  let nothing = 0;
  const minYear = new Date().getUTCFullYear() - SEASON_YEARS_BACK;

  try {
    for (const league of args.leagues) {
      const sport = playerSport(league);
      if (!sport) throw new Error(`no player profile for ${league}`);
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
          // The page's own build: with ESPN's stored games played per season (NFL; NBA seasons with games that have no box score).
          const regular = buildStagedProfile(sport, log, await fetchReportedGames(pool, league, player.id)).regular;
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
            } else if (result.verdict === "explained (no box score)") {
              // Both sides have the season, but it is not a match: the average is only explained.
              compared += 1;
              explained.push({ ...finding, espnGames: espnLine?.games ?? 0, recorded: siteLine.noBoxScore?.recorded ?? 0 });
            } else {
              nothing += 1;
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
  console.log(`  explained (no box score):   ${explained.length}   (ESPN published no box score for some of the team's games; the games figure matches ESPN or is within 2, the average is inside what those games could hold; never fails the run)`);
  console.log(`  nothing to compare:         ${nothing}   (neither side has anything for the season)`);
  if (!args.live && args.leagues.includes("nfl")) {
    console.log("  Note: in stored mode an NFL season with a stored games figure matches on games by construction (the page and this audit read the same column); only --live checks that figure against ESPN.");
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
    "explained: ESPN published no box score for some of the team's games",
    "games without a box score",
    explained,
    boxlessOf,
    (f) => {
      const ppg = f.differences.find((d) => d.field === "ppg");
      return `${f.league} ${f.playerId} ${f.name} ${f.season}: ESPN ${f.espnGames} games, ${f.recorded} with a box score, ${boxlessOf(f)} without; ppg site ${fmt(ppg?.site ?? null)} / ESPN ${fmt(ppg?.espn ?? null)}${note(f)}`;
    }
  );

  if (failures.length > 0) {
    console.log("\n[audit-player-totals] players that could not be read (not verified)");
    for (const f of failures.slice(0, MISMATCHES_SHOWN)) console.log(`  ${f}`);
  }

  const strictFailures = args.strict ? unverified.length + short.length : 0;
  process.exit(mismatches.length > 0 || failures.length > 0 || strictFailures > 0 ? 1 : 0);
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
