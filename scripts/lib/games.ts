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

// Every completed match previously showed a generic "Final" status pill regardless of
// stage — correct broadcast shorthand for an ordinary NBA/NFL/EPL game, but misleading
// once real stages exist (IPL playoffs, NBA/NFL postseason rounds), and uninformative
// even for an ordinary cricket match (every one of a team's 14 league games looked
// identical). Pull whatever real stage/round info each sport actually exposes instead.
function parseRound(ev: any): string | null {
  // Cricket: `description` reads like "Qualifier 1 (N), Indian Premier League at
  // Chennai, May 23 2023" for a playoff match, or "69th Match (D/N), Indian Premier
  // League at Mumbai, May 21 2023" for an ordinary league one — shorten the latter to
  // "Match 69" instead of discarding it, so every card shows something specific.
  if (typeof ev.description === "string") {
    const stage = ev.description.match(/^(.+?)\s*\([DN/]+\)/)?.[1]?.trim();
    if (!stage) return null;
    const numbered = stage.match(/^(\d+)(?:st|nd|rd|th)\s+Match$/i);
    return numbered ? `Match ${numbered[1]}` : stage;
  }
  // NBA/NFL: a `notes` entry like {"type":"event","headline":"AFC Wild Card Playoffs"}
  // or "NBA Finals - Game 6" exists on real postseason games, but the *same* notes
  // shape also appears on plenty of regular-season games with special billing (NBA
  // Cup group-stage games say "NBA Cup - Group Play"; league also brands one-off
  // international games like "NBA Mexico City Game 2025") — those still count toward
  // the regular-season standings and aren't a playoff round, so a notes headline alone
  // isn't a safe signal. `seasonType.type === 3` is: it's ESPN's own authoritative
  // regular-season/postseason classification for the event, independent of how or why
  // it carries a notes tag.
  if (ev.seasonType?.type !== 3) return null;
  const headline = ev.competitions?.[0]?.notes?.find((n: any) => n.type === "event")?.headline;
  return typeof headline === "string" ? headline : null;
}

// Upserts the game itself, plus the home/away teams it references (from the event's
// own embedded team data) — needed so a several-years-old game whose team has since
// been relegated/renamed/dissolved still resolves in every page's join against `teams`.
export async function upsertEvent(league: League, ev: any) {
  const comp = ev.competitions?.[0];
  // A malformed/incomplete event (seen occasionally from this unofficial API on
  // historical queries) shouldn't abort the whole batch it's part of.
  if (!comp) {
    console.error(`[upsertEvent] ${league} event ${ev?.id} has no competitions data, skipping`);
    return;
  }
  const home = comp.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp.competitors?.find((c: any) => c.homeAway === "away");
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
       status_state, status_detail, status_summary, round, period, clock, completed, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
     on conflict (league, espn_id) do update set
       date = excluded.date, home_score = excluded.home_score, away_score = excluded.away_score,
       home_score_display = excluded.home_score_display, away_score_display = excluded.away_score_display,
       home_winner = excluded.home_winner, away_winner = excluded.away_winner,
       season_year = coalesce(excluded.season_year, games.season_year),
       status_state = excluded.status_state, status_detail = excluded.status_detail,
       status_summary = excluded.status_summary, round = excluded.round,
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
      parseRound(ev),
      status?.period ?? null,
      status?.displayClock ?? null,
      // Cricket's status.type has no `completed` boolean at all (unlike NBA/NFL/soccer,
      // confirmed to have it) — state === "post" is the reliable signal there instead.
      Boolean(status?.type?.completed ?? status?.type?.state === "post"),
    ]
  );
}
