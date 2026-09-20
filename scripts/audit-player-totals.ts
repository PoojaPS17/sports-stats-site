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
// Exits 1 when any season is a MISMATCH (or a live read failed), 2 on bad arguments. Coverage gaps
// (ESPN has the season, the database has no regular-season box scores) are listed, and never fail.
//
// `select` only. The database and the loader are imported after the arguments are validated, so a
// usage error never opens a connection.
import {
  compareSeason,
  espnFigures,
  parseArgs,
  seasonsFromPayload,
  siteSeasons,
  USAGE,
  type AuditLeague,
  type Difference,
  type EspnCategory,
  type SeasonFigures,
  type StoredCategories,
} from "./lib/audit-player-totals";
import { fetchPlayerLog } from "../src/lib/playerLog";
import { buildStagedProfile, playerSport } from "../src/lib/playerProfile";

const LIVE_PAUSE_MS = 150;
const MISMATCHES_SHOWN = 50;
const GAPS_SHOWN = 20;
// The loader keeps ten years of history per player; a live read covers the same window.
const YEARS_BACK = 10;

interface Finding {
  league: AuditLeague;
  playerId: string;
  name: string;
  season: number;
  differences: Difference[];
}

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
  const { seasonRow } = await import("./lib/season-stats");
  const { fetchAthleteSeasonStats } = await import("./lib/espn");
  const mode = args.live ? `live (${args.live} random players per league, read from ESPN now)` : "stored player_season_stats rows";
  console.log(`[audit-player-totals] ${args.leagues.join(", ")}: comparing the site's regular-season totals with ESPN, ${mode}`);

  const mismatches: Finding[] = [];
  const gaps: Finding[] = [];
  const failures: string[] = [];
  let compared = 0;
  let matched = 0;
  let noEspn = 0;

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
          const site = siteSeasons(sport, buildStagedProfile(sport, log).regular);

          let espn: Map<number, StoredCategories>;
          if (args.live) {
            const data = await fetchAthleteSeasonStats(league, player.id);
            espn = seasonsFromPayload((data.categories ?? []) as EspnCategory[], seasonRow, new Date().getUTCFullYear() - YEARS_BACK);
          } else {
            const { rows } = await pool.query<{ season: number; categories: StoredCategories }>(
              `select season, categories from player_season_stats where league = $1 and player_espn_id = $2`,
              [league, player.id]
            );
            espn = new Map(rows.map((r) => [r.season, r.categories]));
          }

          const seasons = [...new Set([...site.keys(), ...espn.keys()])].sort((a, b) => a - b);
          for (const season of seasons) {
            const siteLine: SeasonFigures = site.get(season) ?? { games: 0, figures: {} };
            const stored = espn.get(season);
            const espnLine = stored ? espnFigures(league, stored) : null;
            if (!espnLine && !siteLine.games) continue; // nothing on either side
            const result = compareSeason(siteLine, espnLine);
            const finding: Finding = { league, playerId: player.id, name: player.name, season, differences: result.differences };
            if (result.verdict === "match") {
              compared += 1;
              matched += 1;
            } else if (result.verdict === "MISMATCH") {
              compared += 1;
              mismatches.push(finding);
            } else if (result.verdict === "no box scores") {
              gaps.push(finding);
            } else {
              noEspn += 1;
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

  console.log("\n[audit-player-totals] summary");
  console.log(`  compared:      ${compared} player-seasons (site and ESPN both have the season)`);
  console.log(`  matched:       ${matched}`);
  console.log(`  mismatched:    ${mismatches.length}`);
  console.log(`  coverage gaps: ${gaps.length} (ESPN has the season, the database has no regular-season box scores; not counted as matches)`);
  console.log(`  no ESPN row:   ${noEspn} (the site has regular-season games, ESPN has no row for that season)`);
  if (failures.length > 0) console.log(`  failed reads:  ${failures.length}`);

  if (mismatches.length > 0) {
    console.log(`\n[audit-player-totals] MISMATCH (first ${Math.min(MISMATCHES_SHOWN, mismatches.length)} of ${mismatches.length})`);
    for (const m of mismatches.slice(0, MISMATCHES_SHOWN)) {
      const what = m.differences.map((d) => `${d.field} site ${fmt(d.site)} / ESPN ${fmt(d.espn)}`).join("; ");
      console.log(`  ${m.league} ${m.playerId} ${m.name} ${m.season}: ${what}`);
    }
    if (!args.live) {
      console.log("  Note: stored rows for a player who changed teams mid-season may hold only the first team's stint; re-check those with --live.");
    }
  }

  if (gaps.length > 0) {
    const bySeason = new Map<string, number>();
    for (const g of gaps) bySeason.set(`${g.league} ${g.season}`, (bySeason.get(`${g.league} ${g.season}`) ?? 0) + 1);
    console.log("\n[audit-player-totals] coverage gaps by season (box scores not backfilled for that season yet?)");
    for (const [key, count] of [...bySeason.entries()].sort()) console.log(`  ${key}: ${count} players`);
    console.log(`  first ${Math.min(GAPS_SHOWN, gaps.length)}:`);
    for (const g of gaps.slice(0, GAPS_SHOWN)) console.log(`  ${g.league} ${g.playerId} ${g.name} ${g.season}`);
  }

  if (failures.length > 0) {
    console.log("\n[audit-player-totals] players that could not be read (not verified)");
    for (const f of failures.slice(0, MISMATCHES_SHOWN)) console.log(`  ${f}`);
  }

  process.exit(mismatches.length > 0 || failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[audit-player-totals] failed:", err);
  process.exit(1);
});
