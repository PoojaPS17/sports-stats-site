import { pool } from "./lib/db";
import { fetchScoreboard, type League } from "./lib/espn";

const LEAGUES: League[] = ["nba", "nfl", "epl", "ipl"];
const DAYS_BACK = 2;
const DAYS_FORWARD = 5;

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function datesToScan(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let offset = -DAYS_BACK; offset <= DAYS_FORWARD; offset++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + offset);
    dates.push(toYYYYMMDD(d));
  }
  return dates;
}

// Most sports report a plain numeric score. Cricket reports a compound string like
// "161/5 (18/20 ov, target 156)" — pull the leading runs count out for sorting/display
// fallback, and keep the full string for the real display.
function parseScore(raw: unknown): { num: number | null; display: string | null } {
  if (raw === undefined || raw === null || raw === "") return { num: null, display: null };
  const str = String(raw);
  const leading = str.match(/^\d+/);
  const num = leading ? Number(leading[0]) : null;
  const display = /[^\d]/.test(str) ? str : null;
  return { num, display };
}

async function upsertEvent(league: League, ev: any) {
  const comp = ev.competitions[0];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  const status = comp.status;
  const homeScore = parseScore(home?.score);
  const awayScore = parseScore(away?.score);

  await pool.query(
    `insert into games (
       league, espn_id, date, name, short_name,
       home_team_espn_id, away_team_espn_id, home_score, away_score,
       home_score_display, away_score_display, home_winner, away_winner,
       status_state, status_detail, period, clock, completed, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
     on conflict (league, espn_id) do update set
       date = excluded.date, home_score = excluded.home_score, away_score = excluded.away_score,
       home_score_display = excluded.home_score_display, away_score_display = excluded.away_score_display,
       home_winner = excluded.home_winner, away_winner = excluded.away_winner,
       status_state = excluded.status_state, status_detail = excluded.status_detail,
       period = excluded.period, clock = excluded.clock, completed = excluded.completed,
       updated_at = now()`,
    [
      league,
      ev.id,
      ev.date,
      ev.name,
      ev.shortName ?? null,
      home?.team?.id,
      away?.team?.id,
      homeScore.num,
      awayScore.num,
      homeScore.display,
      awayScore.display,
      home?.winner === true || home?.winner === "true" ? true : home?.winner === false || home?.winner === "false" ? false : null,
      away?.winner === true || away?.winner === "true" ? true : away?.winner === false || away?.winner === "false" ? false : null,
      status?.type?.state ?? null,
      status?.type?.detail ?? null,
      status?.period ?? null,
      status?.displayClock ?? null,
      Boolean(status?.type?.completed),
    ]
  );
}

async function main() {
  for (const league of LEAGUES) {
    const seen = new Set<string>();
    let count = 0;
    for (const date of datesToScan()) {
      const data = await fetchScoreboard(league, date);
      for (const ev of data.events ?? []) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        await upsertEvent(league, ev);
        count++;
      }
    }
    console.log(`[fetch-scores] ${league}: upserted ${count} games`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-scores] failed:", err);
  process.exit(1);
});
