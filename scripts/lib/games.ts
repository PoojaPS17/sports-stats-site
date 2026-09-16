import { pool } from "./db";
import type { League } from "./espn";
import { upsertTeam } from "./teams";

// The scoreboard endpoint reports a plain string/number score. The per-team schedule
// endpoint instead reports `{ value, displayValue }`. Cricket's is a compound string
// like "161/5 (18/20 ov, target 156)" — pull the leading runs count out for
// sorting/display fallback, and keep the full string for the real display.
function parseScore(raw: unknown): { num: number | null; display: string | null } {
  if (raw === undefined || raw === null || raw === "") return { num: null, display: null };
  if (typeof raw === "object") {
    const obj = raw as { value?: number; displayValue?: string };
    return parseScore(obj.displayValue ?? obj.value);
  }
  const str = String(raw);
  const leading = str.match(/^\d+/);
  const num = leading ? Number(leading[0]) : null;
  const display = /[^\d]/.test(str) ? str : null;
  return { num, display };
}

function parseWinner(raw: unknown): boolean | null {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return null;
}

// Upserts the game itself, plus the home/away teams it references (from the event's
// own embedded team data) — needed so a several-years-old game whose team has since
// been relegated/renamed/dissolved still resolves in every page's join against `teams`.
export async function upsertEvent(league: League, ev: any) {
  const comp = ev.competitions[0];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  const status = comp.status;
  const homeScore = parseScore(home?.score);
  const awayScore = parseScore(away?.score);

  if (home?.team) await upsertTeam(league, home.team);
  if (away?.team) await upsertTeam(league, away.team);

  await pool.query(
    `insert into games (
       league, espn_id, date, name, short_name,
       home_team_espn_id, away_team_espn_id, home_score, away_score,
       home_score_display, away_score_display, home_winner, away_winner, season_year,
       status_state, status_detail, status_summary, period, clock, completed, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now())
     on conflict (league, espn_id) do update set
       date = excluded.date, home_score = excluded.home_score, away_score = excluded.away_score,
       home_score_display = excluded.home_score_display, away_score_display = excluded.away_score_display,
       home_winner = excluded.home_winner, away_winner = excluded.away_winner,
       season_year = coalesce(excluded.season_year, games.season_year),
       status_state = excluded.status_state, status_detail = excluded.status_detail,
       status_summary = excluded.status_summary,
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
      parseWinner(home?.winner),
      parseWinner(away?.winner),
      ev.season?.year ?? null,
      status?.type?.state ?? null,
      status?.type?.detail ?? null,
      status?.summary ?? null,
      status?.period ?? null,
      status?.displayClock ?? null,
      // Cricket's status.type has no `completed` boolean at all (unlike NBA/NFL/soccer,
      // confirmed to have it) — state === "post" is the reliable signal there instead.
      Boolean(status?.type?.completed ?? status?.type?.state === "post"),
    ]
  );
}
