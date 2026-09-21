import { pool } from "./db";
import { normalizeStage } from "../../src/lib/stage";
import { isCricketLeague, isCupCompetition, slugify, type League } from "./espn";
import { resolveCricketWinner } from "../../src/lib/cricketResult";
import { isNeverPlayed } from "../../src/lib/gameStatus";
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

// Odds/broadcast/weather are only ever present on the live scoreboard fetch (the
// endpoint that also powers the recurring 15-min scrape) — the per-team season
// schedule endpoint used for historical backfills doesn't carry them, which is fine:
// a betting line or forecast for a 2018 game has no meaning anyway. ESPN also stops
// listing odds once a game goes final, so these are coalesced against the existing DB
// value on upsert rather than overwritten with null — the pre-game line stays visible
// as context after the game finishes instead of disappearing.
function parseOdds(comp: any): { details: string | null; spread: number | null; overUnder: number | null; provider: string | null } {
  const odds = comp.odds?.[0];
  if (!odds) return { details: null, spread: null, overUnder: null, provider: null };
  return {
    details: typeof odds.details === "string" ? odds.details : null,
    spread: typeof odds.spread === "number" ? odds.spread : null,
    overUnder: typeof odds.overUnder === "number" ? odds.overUnder : null,
    provider: odds.provider?.name ?? null,
  };
}

function parseBroadcast(comp: any): string | null {
  const names = comp.broadcasts?.[0]?.names;
  return Array.isArray(names) && names.length > 0 ? names.join(", ") : null;
}

function parseWeather(ev: any): { display: string | null; temperature: number | null } {
  const w = ev.weather;
  if (!w) return { display: null, temperature: null };
  return {
    display: typeof w.displayValue === "string" ? w.displayValue : null,
    temperature: typeof w.temperature === "number" ? w.temperature : null,
  };
}

// ESPN's season type sits in a different field per feed: the scoreboard's `season.type`, the team
// schedule's `seasonType.type` (1 preseason, 2 regular, 3 post, 5 play-in). Soccer leagues put a
// large competition-specific id there instead, so the value is only meaningful (and only stored)
// for the NBA and NFL. The competition abbreviation (STD, ALLSTAR, CC, playoff rounds) is on both.
export function parseStageFields(league: League, ev: any): { seasonType: number | null; competitionType: string | null } {
  if (league !== "nba" && league !== "nfl") return { seasonType: null, competitionType: null };
  const raw = ev.seasonType?.type ?? ev.season?.type;
  const abbreviation = ev.competitions?.[0]?.type?.abbreviation;
  return {
    seasonType: typeof raw === "number" && Number.isInteger(raw) ? raw : null,
    competitionType: typeof abbreviation === "string" && abbreviation ? abbreviation : null,
  };
}

// Every completed match previously showed a generic "Final" status pill regardless of
// stage — correct broadcast shorthand for an ordinary NBA/NFL/EPL game, but misleading
// once real stages exist (IPL playoffs, NBA/NFL postseason rounds), and uninformative
// even for an ordinary cricket match (every one of a team's 14 league games looked
// identical). Pull whatever real stage/round info each sport actually exposes instead.
export function parseRound(league: League, ev: any): string | null {
  if (isCupCompetition(league)) return parseCupRound(ev);
  // Cricket: `description` reads like "Qualifier 1 (N), Indian Premier League at
  // Chennai, May 23 2023" for a playoff match, or "69th Match (D/N), Indian Premier
  // League at Mumbai, May 21 2023" for an ordinary league one — shorten the latter to
  // "Match 69" instead of discarding it, so every card shows something specific.
  if (typeof ev.description === "string") return parseCricketRound(ev.description);
  // NBA/NFL: a `notes` entry like {"type":"event","headline":"AFC Wild Card Playoffs"}
  // or "NBA Finals - Game 6" exists on real postseason games, but the *same* notes
  // shape also appears on plenty of regular-season games with special billing (NBA
  // Cup group-stage games say "NBA Cup - Group Play"; league also brands one-off
  // international games like "NBA Mexico City Game 2025") — those still count toward
  // the regular-season standings and aren't a playoff round, so a notes headline alone
  // isn't a safe signal. `seasonType.type === 3` is: it's ESPN's own authoritative
  // regular-season/postseason classification for the event, independent of how or why
  // it carries a notes tag. The scoreboard feed carries the same fact as `season.type`, and the
  // Pro Bowl is tagged postseason but is not a playoff round.
  const { seasonType, competitionType } = parseStageFields(league, ev);
  if (seasonType !== 3 || competitionType === "ALLSTAR") return null;
  const headline = ev.competitions?.[0]?.notes?.find((n: any) => n.type === "event")?.headline;
  return typeof headline === "string" ? normalizeStage(headline) : null;
}

// "Match 12" for a numbered league match; anything else as given.
function matchNumber(stage: string): string {
  const numbered = stage.match(/^(\d+)(?:st|nd|rd|th)\s+Match$/i);
  return numbered ? `Match ${numbered[1]}` : stage;
}

/**
 * The stage in a cricket event's `description`: "<stage>[ (D/N)], <series> at <venue>, <date>", where the
 * stage may itself hold a comma ("22nd Match, Group B"). A match with a day/night marker keeps what
 * precedes the marker, exactly as it always has. A daytime match has no marker ("Final, Women's Big
 * Bash League at Hobart, Nov 30 2024", the CWC 2019 semi-finals, T20 World Cup 2010): its stage is
 * what precedes the "<series> at <venue>" segment, or the first comma segment when the description
 * has no such segment. Named stages get the usual spelling (normalizeStage), so "2nd Semi-final"
 * reads as "2nd Semi-Final". A description that is only "<series> at <venue>" has no stage.
 */
export function parseCricketRound(description: string): string | null {
  const marked = description.match(/^(.+?)\s*\([DN/]+\)/)?.[1]?.trim();
  if (marked) return matchNumber(marked);
  const parts = description.split(",").map((p) => p.trim());
  const seriesAt = parts.findIndex((p) => / at /.test(p));
  if (seriesAt === 0 || (seriesAt === -1 && parts.length < 2)) return null;
  const stage = parts.slice(0, seriesAt === -1 ? 1 : seriesAt).join(", ").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return stage ? normalizeStage(matchNumber(stage)) : null;
}

// Cup competitions (Champions League): every event carries its stage — as
// `season.slug` on the scoreboard ("round-of-16", "league-phase") and as
// `seasonType.name` on the team-schedule endpoint ("Round of 16") — plus the leg of a
// two-legged tie. The league phase (or the old group stage) is the competition's
// "regular season", so its games keep a null round and feed the tables, matchday
// numbering and projections; knockout games are tagged with their stage instead.
const CUP_LEAGUE_STAGES = new Set(["league-phase", "group-stage", "regular-season"]);
const CUP_STAGE_LABELS: Record<string, string> = {
  "knockout-round-playoffs": "Knockout Playoffs",
  "round-of-16": "Round of 16",
  quarterfinals: "Quarterfinals",
  semifinals: "Semifinals",
  final: "Final",
};

function parseCupRound(ev: any): string | null {
  const fromName = typeof ev.seasonType?.name === "string" ? slugify(ev.seasonType.name) : null;
  const fromSlug = typeof ev.season?.slug === "string" ? ev.season.slug : null;
  const slug = fromSlug && (CUP_LEAGUE_STAGES.has(fromSlug) || CUP_STAGE_LABELS[fromSlug]) ? fromSlug : (fromName ?? fromSlug);
  if (!slug || CUP_LEAGUE_STAGES.has(slug)) return null;
  // An unrecognised stage is still a stage (shown as given), unless it is plainly a
  // season name ("2026-27-uefa-champions-league"), which means the feed gave no stage.
  if (!CUP_STAGE_LABELS[slug] && /\d{4}/.test(slug)) return null;
  const stage = CUP_STAGE_LABELS[slug] ?? (typeof ev.seasonType?.name === "string" ? ev.seasonType.name : slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()));
  const leg = ev.competitions?.[0]?.leg?.displayValue;
  return leg ? `${stage} - ${leg}` : stage;
}

// The second leg of a knockout tie carries a note like "2nd Leg - Arsenal advance 5-1
// on aggregate" or "2nd Leg - Tied on aggregate - RMA advance 4-2 on penalties" —
// the only place the feed states who went through, which a single leg's score
// cannot show. Kept as the game's summary line (the same slot cricket's "won by 5
// wkts" uses).
function parseCupSummary(ev: any): string | null {
  const headline = ev.competitions?.[0]?.notes?.find((n: any) => n.type === "event")?.headline;
  if (typeof headline !== "string") return null;
  const text = headline.replace(/^(1st|2nd)\s+Leg\s*-\s*/i, "").trim();
  return /advance|aggregate|penalt/i.test(text) ? text : null;
}

// NFL events carry `week: { number, text }` on both the scoreboard and the team
// schedule endpoints (playoff weeks continue the numbering: 19 = Wild Card). No
// soccer or basketball endpoint exposes a round number, so this is null there.
function parseWeek(ev: any): number | null {
  const n = ev.week?.number;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
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
  // A fixture whose sides are not yet known ("TBA v TBA" finals week placeholders)
  // is not a game; it would list as a match between two blank teams.
  const placeholder = (c: any) => !c?.team?.id || /^(tba|tbc|tbd)$/i.test(String(c.team.displayName ?? c.team.name ?? c.team.abbreviation ?? ""));
  if (placeholder(home) || placeholder(away) || String(home.team.id) === String(away.team.id)) {
    console.log(`[upsertEvent] ${league} event ${ev.id}: sides not yet known, skipped`);
    return;
  }
  // The All-Star Game and the Pro Bowl are exhibitions between made-up sides: not part of any
  // season's record, and their "teams" would be added to the teams table.
  const stageFields = parseStageFields(league, ev);
  if (stageFields.competitionType === "ALLSTAR") {
    console.log(`[upsertEvent] ${league} event ${ev.id}: all-star exhibition, skipped`);
    return;
  }
  const status = comp.status;
  const homeScore = parseScore(home?.score);
  const awayScore = parseScore(away?.score);
  // Cricket's feed flags miss a super-over winner (false/false) and are sometimes
  // absent; the status summary names the outcome.
  const winner =
    isCricketLeague(league) && status?.type?.state === "post"
      ? resolveCricketWinner(status?.summary ?? null, { name: home.team.displayName ?? home.team.name, abbreviation: home.team.abbreviation, score: typeof home.score === "string" ? home.score : null }, { name: away.team.displayName ?? away.team.name, abbreviation: away.team.abbreviation, score: typeof away.score === "string" ? away.score : null }, { home: parseWinner(home.winner), away: parseWinner(away.winner) })
      : { home: parseWinner(home?.winner), away: parseWinner(away?.winner) };
  const odds = parseOdds(comp);
  const broadcast = parseBroadcast(comp);
  const weather = parseWeather(ev);

  if (home?.team) await upsertTeam(league, home.team);
  if (away?.team) await upsertTeam(league, away.team);

  await pool.query(
    `insert into games (
       league, espn_id, date, name, short_name,
       home_team_espn_id, away_team_espn_id, home_score, away_score,
       home_score_display, away_score_display, home_winner, away_winner, season_year,
       status_state, status_detail, status_summary, round, period, clock, completed,
       odds_details, odds_spread, odds_over_under, odds_provider, broadcast_network,
       weather_display, weather_temperature, week, first_seen_date, updated_at,
       season_type, competition_type
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$3, now(),
       $30,$31)
     on conflict (league, espn_id) do update set
       date = excluded.date, home_score = excluded.home_score, away_score = excluded.away_score,
       home_score_display = excluded.home_score_display, away_score_display = excluded.away_score_display,
       home_winner = excluded.home_winner, away_winner = excluded.away_winner,
       season_year = coalesce(excluded.season_year, games.season_year),
       status_state = excluded.status_state, status_detail = excluded.status_detail,
       status_summary = excluded.status_summary, round = coalesce(excluded.round, games.round),
       period = excluded.period, clock = excluded.clock, completed = excluded.completed,
       odds_details = coalesce(excluded.odds_details, games.odds_details),
       odds_spread = coalesce(excluded.odds_spread, games.odds_spread),
       odds_over_under = coalesce(excluded.odds_over_under, games.odds_over_under),
       odds_provider = coalesce(excluded.odds_provider, games.odds_provider),
       broadcast_network = coalesce(excluded.broadcast_network, games.broadcast_network),
       weather_display = coalesce(excluded.weather_display, games.weather_display),
       weather_temperature = coalesce(excluded.weather_temperature, games.weather_temperature),
       week = coalesce(excluded.week, games.week),
       season_type = coalesce(excluded.season_type, games.season_type),
       competition_type = coalesce(excluded.competition_type, games.competition_type),
       first_seen_date = coalesce(games.first_seen_date, excluded.first_seen_date),
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
      winner.home,
      winner.away,
      ev.season?.year ?? null,
      status?.type?.state ?? null,
      status?.type?.detail ?? null,
      status?.summary ?? (isCupCompetition(league) ? parseCupSummary(ev) : null),
      parseRound(league, ev),
      status?.period ?? null,
      status?.displayClock ?? null,
      // Cricket's status.type has no `completed` boolean at all (unlike NBA/NFL/soccer,
      // confirmed to have it) — state === "post" is the reliable signal there instead,
      // except that ESPN files a cancelled or postponed match under "post" too, and that
      // one was never played. An abandoned match is a result and stays finished.
      Boolean(status?.type?.completed ?? (status?.type?.state === "post" && !isNeverPlayed(status?.type?.detail) && !isNeverPlayed(status?.summary))),
      odds.details,
      odds.spread,
      odds.overUnder,
      odds.provider,
      broadcast,
      weather.display,
      weather.temperature,
      parseWeek(ev),
      stageFields.seasonType,
      stageFields.competitionType,
    ]
  );
}
