// One-time historical backfill of per-match cricket batting/bowling/fielding figures
// for every completed game in a cricket competition — powers real career stats
// (matches/runs/average/SR/wickets) and splits by opponent/venue/team, computed on
// read from these raw per-match rows (never a maintained running total, so re-running
// this is always safe: each row is just overwritten with the same facts, nothing is
// double-counted).
import { pool } from "./lib/db";
import { fetchSummary, type League } from "./lib/espn";
import { extractCricketMatchStats } from "./lib/cricket-career";
import { uniqueSlugFor } from "./lib/players";

const REQUEST_DELAY_MS = 100;
const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `--missing` restricts the run to completed games that have no player rows yet — the
// mode for topping up after a history extension, when re-reading every already-loaded
// match would cost more requests than the new ones.
async function backfillLeague(league: League, missingOnly: boolean) {
  const { rows: games } = await pool.query(
    `select g.espn_id from games g
     where g.league = $1 and g.completed = true
       and ($2 = false or not exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id))
     order by g.date asc`,
    [league, missingOnly]
  );

  let processed = 0;
  let playerRows = 0;
  for (const { espn_id } of games) {
    try {
      const summary = await fetchSummary(league, espn_id);
      const { venue, players } = extractCricketMatchStats(summary);

      if (venue) {
        await pool.query(`update games set venue = $1 where league = $2 and espn_id = $3`, [venue, league, espn_id]);
      }

      for (const p of players) {
        const slug = await uniqueSlugFor(league, p.athleteId, p.name);
        // A full run walks games oldest-first, so the last upsert leaves each player on
        // the club of their latest match. A --missing run only visits older, newly added
        // games, so it must not move an existing player back to a club they have since
        // left; it only creates players we have never seen.
        await pool.query(
          `insert into players (league, espn_id, team_espn_id, name, slug)
           values ($1, $2, $3, $4, $5)
           on conflict (league, espn_id) do update set
             name = excluded.name,
             team_espn_id = case when $6 then players.team_espn_id else excluded.team_espn_id end`,
          [league, p.athleteId, p.teamId, p.name, slug, missingOnly]
        );

        await pool.query(
          `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
           values ($1, $2, $3, $4, $5, now())
           on conflict (league, game_espn_id, player_espn_id) do update set
             team_espn_id = excluded.team_espn_id, stats = excluded.stats, updated_at = now()`,
          [league, espn_id, p.athleteId, p.teamId, JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches })]
        );
        playerRows++;
      }
      processed++;
    } catch (err) {
      console.error(`[backfill-cricket-player-stats] ${league} game ${espn_id} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[backfill-cricket-player-stats] ${league}: processed ${processed}/${games.length} games, upserted ${playerRows} player-game rows`);
}

async function main() {
  const args = process.argv.slice(2);
  const missingOnly = args.includes("--missing");
  const target = args.find((a) => !a.startsWith("--")) as League | undefined;
  const leagues: League[] = target ? [target] : CRICKET_LEAGUES;

  for (const league of leagues) {
    console.log(`[backfill-cricket-player-stats] starting ${league}${missingOnly ? " (games without player rows only)" : ""}...`);
    await backfillLeague(league, missingOnly);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-cricket-player-stats] failed:", err);
  process.exit(1);
});
