// Imports men's international matches (ODIs, T20Is) from Cricsheet's ball-by-ball JSON
// archives into the same tables the ESPN-fed cricket competitions use, so every
// cricket page (match scorecard, player career, leaders, centuries, compare, team
// results) works unchanged for the two international formats.
//
//   npx tsx --env-file=.env.local scripts/import-cricsheet.ts odi  <dir-of-json> --people <people.csv> [--names <cache.json>] [--missing] [--limit N]
//   npx tsx --env-file=.env.local scripts/import-cricsheet.ts t20i <dir-of-json> --people <people.csv> ...
//
// Data: https://cricsheet.org/downloads/ (odis_male_json.zip, t20s_male_json.zip) and
// the people register https://cricsheet.org/register/people.csv. Cricsheet's licence
// requires attribution, which the site footer carries. Cricsheet withholds matches
// involving Afghanistan's men's team and publishes a match a week or two after it
// ends; scripts/import-cricket-espn.ts fills both gaps from ESPN in this same shape.
//
// Ids: Cricsheet file names are Cricinfo match ids, and the register maps each person
// to their Cricinfo id — both are exactly the ids ESPN's cricket feeds use, so a
// player here is the same row family as in the IPL/BBL/World Cup data and a match
// could later be enriched from ESPN by the same id. People without a Cricinfo id
// (rare) get a "cs-" + register id instead.
//
// Names: Cricsheet spells players as initials plus surname ("V Kohli"). Full names come
// from rows we already hold for the same id in any cricket league, else from ESPN's
// athlete record (cached in the --names file between runs), else the Cricsheet form.
//
// Everything is an upsert; `--missing` skips matches already stored, for a cheap weekly
// top-up after downloading a fresh archive.
//
// Cards-only mode (`ipl` / `bbl`, archives ipl_male_json.zip and bbl_male_json.zip):
// those competitions are ESPN-fed, but ESPN has no scorecard for ~100 older matches.
// For games already stored that have no player rows, the matching Cricsheet file
// (same Cricinfo id) supplies the scorecard: player figures and the match report are
// written, the game row is left as ESPN has it, and players keep their current club.
import { normalizeStage } from "../src/lib/stage";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./lib/db";
import { slugify } from "./lib/espn";
import { uniqueSlugFor } from "./lib/players";
import type { CricketPlayerMatchStats } from "./lib/cricket-career";

type IntlLeague = "odi" | "t20i";
type CardsLeague = "ipl" | "bbl";
type CsLeague = IntlLeague | CardsLeague;
const MATCH_TYPE: Record<CsLeague, string> = { odi: "ODI", t20i: "T20", ipl: "T20", bbl: "T20" };
const CARDS_ONLY: Record<CsLeague, boolean> = { odi: false, t20i: false, ipl: true, bbl: true };
const NAME_FETCH_CONCURRENCY = 4;

/* ------------------------------------------------------------------------ */
/* Arguments                                                                 */
/* ------------------------------------------------------------------------ */

function parseArgs() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const league = positional[0] as CsLeague | undefined;
  const dir = positional[1];
  if (!league || !(league in MATCH_TYPE) || !dir || !opt("people")) {
    console.error("usage: import-cricsheet.ts <odi|t20i|ipl|bbl> <dir> --people <people.csv> [--names <cache.json>] [--missing] [--limit N]");
    process.exit(1);
  }
  return {
    league,
    dir,
    people: opt("people")!,
    names: opt("names"),
    missingOnly: args.includes("--missing"),
    limit: opt("limit") ? Number(opt("limit")) : Infinity,
  };
}

/* ------------------------------------------------------------------------ */
/* Register: Cricsheet person id -> Cricinfo/ESPN id                          */
/* ------------------------------------------------------------------------ */

function loadRegister(path: string): Map<string, string | null> {
  const lines = readFileSync(path, "utf8").split("\n");
  const header = lines[0].split(",");
  const idCol = header.indexOf("identifier");
  const cricinfoCol = header.indexOf("key_cricinfo");
  const out = new Map<string, string | null>();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    // Names never contain commas in this register, so a plain split is safe.
    const cols = line.split(",");
    out.set(cols[idCol], cols[cricinfoCol] || null);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Match parsing                                                             */
/* ------------------------------------------------------------------------ */

interface BatterLine {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  order: number;
}
interface BowlerLine {
  id: string;
  balls: number;
  maidens: number;
  conceded: number;
  wickets: number;
  order: number;
}
interface Innings {
  team: string;
  runs: number;
  wickets: number;
  balls: number;
  allOut: boolean;
  target: { runs: number; overs: number } | null;
  batters: BatterLine[];
  bowlers: BowlerLine[];
  catches: Map<string, number>;
}

// Dismissals the bowler is credited with.
const BOWLER_WICKETS = new Set(["bowled", "caught", "lbw", "stumped", "caught and bowled", "hit wicket"]);
// Ways of leaving the crease that do not count as a wicket in the total.
const NOT_A_WICKET = new Set(["retired hurt", "retired not out"]);

function oversText(balls: number, ballsPerOver = 6): string {
  return `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
}

function parseInnings(raw: any, personId: (name: string) => string | null, ballsPerOver: number, playersInXI: number): Innings {
  const batters = new Map<string, BatterLine>();
  const bowlers = new Map<string, BowlerLine>();
  const catches = new Map<string, number>();
  let runs = 0;
  let wickets = 0;
  let balls = 0;

  const batter = (name: string): BatterLine | null => {
    const id = personId(name);
    if (!id) return null;
    if (!batters.has(id)) batters.set(id, { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, order: batters.size });
    return batters.get(id)!;
  };
  const bowler = (name: string): BowlerLine | null => {
    const id = personId(name);
    if (!id) return null;
    if (!bowlers.has(id)) bowlers.set(id, { id, balls: 0, maidens: 0, conceded: 0, wickets: 0, order: bowlers.size });
    return bowlers.get(id)!;
  };

  for (const over of raw.overs ?? []) {
    let overBowler: string | null = null;
    let overConceded = 0;
    let overLegalBalls = 0;
    let singleBowler = true;
    for (const d of over.deliveries ?? []) {
      const wides = d.extras?.wides ?? 0;
      const noballs = d.extras?.noballs ?? 0;
      const legal = wides === 0 && noballs === 0;
      runs += d.runs?.total ?? 0;
      if (legal) balls++;

      const bt = batter(d.batter);
      if (bt) {
        if (wides === 0) bt.balls++;
        bt.runs += d.runs?.batter ?? 0;
        if (!d.runs?.non_boundary) {
          if (d.runs?.batter === 4) bt.fours++;
          if (d.runs?.batter === 6) bt.sixes++;
        }
      }
      // The non-striker has come to the crease even if they never face a ball
      // (they can still be run out), so they belong on the card.
      batter(d.non_striker);

      const bw = bowler(d.bowler);
      if (bw) {
        if (overBowler === null) overBowler = bw.id;
        else if (overBowler !== bw.id) singleBowler = false;
        if (legal) {
          bw.balls++;
          overLegalBalls++;
        }
        const conceded = (d.runs?.batter ?? 0) + wides + noballs;
        bw.conceded += conceded;
        overConceded += conceded;
      }

      for (const w of d.wickets ?? []) {
        const kind: string = w.kind ?? "";
        if (NOT_A_WICKET.has(kind)) continue;
        wickets++;
        const out = batter(w.player_out);
        if (out) out.out = true;
        if (bw && BOWLER_WICKETS.has(kind)) bw.wickets++;
        if (kind === "caught and bowled" && bw) catches.set(bw.id, (catches.get(bw.id) ?? 0) + 1);
        if (kind === "caught" || kind === "stumped") {
          const f = (w.fielders ?? [])[0];
          if (f && !f.substitute && f.name) {
            const fid = personId(f.name);
            if (fid) catches.set(fid, (catches.get(fid) ?? 0) + 1);
          }
        }
      }
    }
    if (overBowler && singleBowler && overConceded === 0 && overLegalBalls === ballsPerOver) {
      bowlers.get(overBowler)!.maidens++;
    }
  }

  return {
    team: raw.team,
    runs,
    wickets,
    balls,
    allOut: wickets >= playersInXI - 1,
    target: raw.target ? { runs: raw.target.runs, overs: raw.target.overs } : null,
    batters: [...batters.values()].filter((b) => b.balls > 0 || b.out).sort((a, b) => a.order - b.order),
    bowlers: [...bowlers.values()].sort((a, b) => a.order - b.order),
    catches,
  };
}

interface ParsedMatch {
  id: string;
  date: string;
  seasonYear: number;
  teams: [string, string];
  venue: string | null;
  city: string | null;
  event: { name: string | null; stage: string | null };
  officials: { name: string; role: string }[];
  playerOfMatch: string[];
  innings: Innings[];
  hadSuperOver: boolean;
  outcome: any;
  maxOvers: number | null;
  ballsPerOver: number;
  /** Player Cricinfo id -> team name, for everyone in the XIs. */
  squads: Map<string, string>;
  names: Map<string, string>;
}

function parseMatch(id: string, data: any, register: Map<string, string | null>): ParsedMatch | null {
  const info = data.info ?? {};
  if (!info.teams || info.teams.length !== 2 || !info.dates?.length) return null;
  const registry: Record<string, string> = info.registry?.people ?? {};
  const names = new Map<string, string>();
  const personId = (name: string | undefined): string | null => {
    if (!name) return null;
    const ident = registry[name];
    if (!ident) return null;
    const id = register.get(ident) || `cs-${ident}`;
    names.set(id, name);
    return id;
  };

  const squads = new Map<string, string>();
  for (const [team, list] of Object.entries<string[]>(info.players ?? {})) {
    for (const n of list) {
      const pid = personId(n);
      if (pid) squads.set(pid, team);
    }
  }
  const ballsPerOver: number = info.balls_per_over ?? 6;
  const xi = Math.max(...Object.values<string[]>(info.players ?? {}).map((l) => l.length), 11);

  const innings: Innings[] = [];
  let hadSuperOver = false;
  for (const raw of data.innings ?? []) {
    if (raw.super_over) {
      hadSuperOver = true;
      continue;
    }
    innings.push(parseInnings(raw, personId, ballsPerOver, xi));
  }

  const officials: { name: string; role: string }[] = [];
  const roles: [string, string][] = [
    ["umpires", "Umpire"],
    ["tv_umpires", "TV Umpire"],
    ["reserve_umpires", "Reserve Umpire"],
    ["match_referees", "Match Referee"],
  ];
  for (const [key, role] of roles) for (const n of info.officials?.[key] ?? []) officials.push({ name: n, role });

  return {
    id,
    date: info.dates[0],
    seasonYear: Number(info.dates[0].slice(0, 4)),
    teams: [info.teams[0], info.teams[1]],
    venue: info.venue ?? null,
    city: info.city ?? null,
    event: { name: info.event?.name ?? null, stage: info.event?.stage ?? null },
    officials,
    playerOfMatch: (info.player_of_match ?? []).map((n: string) => personId(n)).filter(Boolean) as string[],
    innings,
    hadSuperOver,
    outcome: info.outcome ?? {},
    maxOvers: typeof info.overs === "number" ? info.overs : null,
    ballsPerOver,
    squads,
    names,
  };
}

/* ------------------------------------------------------------------------ */
/* Display strings, mirroring the ESPN-fed rows so cards render alike         */
/* ------------------------------------------------------------------------ */

function scoreDisplay(inn: Innings, maxOvers: number | null, ballsPerOver: number, chasing: boolean): string | null {
  const overs = oversText(inn.balls, ballsPerOver);
  const limit = inn.target?.overs ?? maxOvers;
  const oversPart = limit ? `${overs}/${limit} ov` : `${overs} ov`;
  const score = inn.allOut ? String(inn.runs) : `${inn.runs}/${inn.wickets}`;
  if (chasing && inn.target) return `${score} (${oversPart}, target ${inn.target.runs})`;
  // ESPN leaves the display empty for a first innings that was bowled out inside
  // its overs — the plain total says it all — and shows overs only when the innings
  // ended early (rain, declaration) with wickets in hand.
  if (inn.allOut) return null;
  const usedAll = limit ? inn.balls >= limit * ballsPerOver : true;
  return usedAll ? score : `${score} (${oversPart})`;
}

function resultSummary(m: ParsedMatch): { summary: string; winner: string | null; noResult: boolean } {
  const o = m.outcome;
  const method = o.method ? ` (${o.method === "D/L" ? "DLS method" : o.method})` : "";
  if (o.winner) {
    if (o.by?.wickets !== undefined) {
      const chase = m.innings[1];
      const limit = chase?.target?.overs ?? m.maxOvers;
      const rem = chase && limit ? limit * m.ballsPerOver - chase.balls : null;
      const remText = rem !== null && rem > 0 && !o.method ? ` (${rem}b rem)` : "";
      return { summary: `${o.winner} won by ${o.by.wickets} wkt${o.by.wickets === 1 ? "" : "s"}${remText}${method}`, winner: o.winner, noResult: false };
    }
    if (o.by?.runs !== undefined) return { summary: `${o.winner} won by ${o.by.runs} run${o.by.runs === 1 ? "" : "s"}${method}`, winner: o.winner, noResult: false };
    if (o.method === "Awarded") return { summary: `${o.winner} won (match awarded)`, winner: o.winner, noResult: false };
    return { summary: `${o.winner} won${method}`, winner: o.winner, noResult: false };
  }
  if (o.result === "tie") {
    if (o.eliminator) return { summary: `Match tied (${o.eliminator} won the Super Over)`, winner: o.eliminator, noResult: false };
    return { summary: `Match tied${method}`, winner: null, noResult: false };
  }
  if (o.result === "no result") return { summary: "No result", winner: null, noResult: true };
  return { summary: o.result ? String(o.result) : "Result unknown", winner: null, noResult: true };
}

function strikeRate(runs: number, balls: number): string {
  return balls > 0 ? ((runs / balls) * 100).toFixed(2) : "-";
}
function economy(conceded: number, balls: number, ballsPerOver: number): string {
  return balls > 0 ? ((conceded / balls) * ballsPerOver).toFixed(2) : "-";
}

/* ------------------------------------------------------------------------ */
/* Teams                                                                     */
/* ------------------------------------------------------------------------ */

interface TeamInfo {
  espn_id: string;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
  color: string | null;
  alternate_color: string | null;
}

function fallbackAbbreviation(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join("").slice(0, 4)).toUpperCase();
}

// National sides already known from the World Cup feeds keep ESPN's id, crest and
// colour; anyone else gets a stable synthetic id. ESPN athlete records also name the
// player's national team, which fills in ids for sides no World Cup feed has listed.
async function buildTeamMap(names: Set<string>, fromAthletes: Map<string, TeamInfo>): Promise<Map<string, TeamInfo>> {
  const { rows } = await pool.query<TeamInfo>(
    `select distinct on (name) espn_id, name, abbreviation, logo_url, color, alternate_color
     from teams where league in ('cwc', 't20wc', 'odi', 't20i') and name = any($1)
     order by name, (logo_url is not null) desc, league`,
    [[...names]]
  );
  const map = new Map<string, TeamInfo>(rows.map((r) => [r.name, r]));
  for (const name of names) {
    if (map.has(name)) continue;
    const a = fromAthletes.get(name);
    map.set(
      name,
      a ?? { espn_id: `cs-${slugify(name)}`, name, abbreviation: fallbackAbbreviation(name), logo_url: null, color: null, alternate_color: null }
    );
  }
  return map;
}

/* ------------------------------------------------------------------------ */
/* Player names                                                              */
/* ------------------------------------------------------------------------ */

interface NameRecord {
  name: string;
  headshot: string | null;
  position: string | null;
  team?: TeamInfo | null;
}

async function fetchAthlete(id: string): Promise<NameRecord | null> {
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/cricket/athletes/${id}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const a = (await res.json())?.athlete;
    if (!a?.displayName) return null;
    const t = a.team;
    return {
      // displayName carries every given name for many older players ("Ashley Fraser
      // Giles", "Warnakulasuriya Patabendige Ushantha Joseph Chaminda Vaas");
      // shortName is the name they are known by.
      name: a.shortName || a.displayName,
      headshot: a.headshot?.href ?? null,
      position: a.position?.name ?? null,
      team: t?.id && t?.displayName
        ? { espn_id: String(t.id), name: t.displayName, abbreviation: t.abbreviation ?? null, logo_url: t.logos?.[0]?.href ?? null, color: t.color ? `#${String(t.color).replace(/^#/, "")}` : null, alternate_color: null }
        : null,
    };
  } catch {
    return null;
  }
}

async function resolveNames(ids: string[], cachePath: string | undefined): Promise<Map<string, NameRecord>> {
  const out = new Map<string, NameRecord>();
  const cache: Record<string, NameRecord> = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

  const { rows } = await pool.query(
    `select distinct on (espn_id) espn_id, name, headshot_url, position
     from players where league in ('ipl', 'bbl', 'cwc', 't20wc', 'odi', 't20i') and espn_id = any($1)
     order by espn_id, (headshot_url is not null) desc, (position is not null) desc`,
    [ids]
  );
  for (const r of rows) out.set(r.espn_id, { name: r.name, headshot: r.headshot_url, position: r.position });

  const pending = ids.filter((id) => !out.has(id) && !id.startsWith("cs-"));
  for (const id of pending) if (cache[id]) out.set(id, cache[id]);
  const toFetch = pending.filter((id) => !cache[id]);
  console.log(`[import-cricsheet] names: ${rows.length} from db, ${pending.length - toFetch.length} cached, fetching ${toFetch.length} from ESPN`);

  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < toFetch.length) {
      const id = toFetch[cursor++];
      const rec = await fetchAthlete(id);
      // A miss is cached too (as an empty name) so a re-run does not re-ask ESPN.
      cache[id] = rec ?? { name: "", headshot: null, position: null };
      if (rec) out.set(id, rec);
      if (++done % 200 === 0) {
        console.log(`[import-cricsheet] names: ${done}/${toFetch.length} fetched`);
        if (cachePath) writeFileSync(cachePath, JSON.stringify(cache));
      }
    }
  };
  await Promise.all(Array.from({ length: NAME_FETCH_CONCURRENCY }, worker));
  if (cachePath) writeFileSync(cachePath, JSON.stringify(cache));
  return out;
}

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

async function upsertTeam(league: CsLeague, t: TeamInfo, slug: string) {
  await pool.query(
    `insert into teams (league, espn_id, name, slug, abbreviation, logo_url, color, alternate_color)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (league, espn_id) do update set
       name = excluded.name, abbreviation = coalesce(excluded.abbreviation, teams.abbreviation),
       logo_url = coalesce(excluded.logo_url, teams.logo_url), color = coalesce(excluded.color, teams.color)`,
    [league, t.espn_id, t.name, slug, t.abbreviation, t.logo_url, t.color, t.alternate_color]
  );
}

async function writeMatch(
  league: CsLeague,
  m: ParsedMatch,
  teamMap: Map<string, TeamInfo>,
  names: Map<string, NameRecord>,
  slugs: Map<string, string>,
  seenPlayers: Set<string>
): Promise<number> {
  const cardsOnly = CARDS_ONLY[league];
  const home = teamMap.get(m.teams[0])!;
  const away = teamMap.get(m.teams[1])!;
  const result = resultSummary(m);
  const second = m.innings[1];
  const inningsOf = (team: string) => m.innings.find((i) => i.team === team);
  const homeInn = inningsOf(m.teams[0]);
  const awayInn = inningsOf(m.teams[1]);
  const display = (inn: Innings | undefined) => (inn ? scoreDisplay(inn, m.maxOvers, m.ballsPerOver, inn === second) : null);
  const stage = normalizeStage(m.event.stage && /final|semi|quarter|qualifier|eliminator|play-?off/i.test(m.event.stage) ? m.event.stage : null);
  const noScores = m.innings.length === 0;

  if (!cardsOnly) await pool.query(
    `insert into games (
       league, espn_id, date, name, short_name, home_team_espn_id, away_team_espn_id,
       home_score, away_score, home_score_display, away_score_display, home_winner, away_winner,
       season_year, status_state, status_detail, status_summary, round, period, clock, completed, venue, first_seen_date, updated_at, local_date
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'post','Final',$15,$16,$17,null,true,$18,$3, now(), $19::date)
     on conflict (league, espn_id) do update set
       date = excluded.date, name = excluded.name, short_name = excluded.short_name,
       home_team_espn_id = excluded.home_team_espn_id, away_team_espn_id = excluded.away_team_espn_id,
       home_score = excluded.home_score, away_score = excluded.away_score,
       home_score_display = excluded.home_score_display, away_score_display = excluded.away_score_display,
       home_winner = excluded.home_winner, away_winner = excluded.away_winner, season_year = excluded.season_year,
       status_state = excluded.status_state, status_detail = excluded.status_detail, status_summary = excluded.status_summary,
       round = excluded.round, period = excluded.period, completed = true, venue = excluded.venue, updated_at = now(),
       local_date = excluded.local_date`,
    [
      league,
      m.id,
      // Cricsheet gives a date only; internationals are day games in local time, so
      // noon UTC keeps the calendar date right in every viewer's timezone.
      `${m.date}T12:00:00Z`,
      `${home.name} v ${away.name}`,
      `${home.abbreviation ?? fallbackAbbreviation(home.name)} v ${away.abbreviation ?? fallbackAbbreviation(away.name)}`,
      home.espn_id,
      away.espn_id,
      noScores ? null : homeInn?.runs ?? 0,
      noScores ? null : awayInn?.runs ?? 0,
      display(homeInn),
      display(awayInn),
      result.noResult ? null : result.winner === home.name,
      result.noResult ? null : result.winner === away.name,
      m.seasonYear,
      result.summary,
      stage,
      m.innings.length || null,
      m.venue,
      // Cricsheet's date is already the local one, so it is the match's local date as it stands.
      m.date,
    ]
  );

  // Players: create or move to this match's side (files are processed oldest-first,
  // so the last write leaves each player with their latest team), and stamp the
  // match date as a roster sighting so the team page's "current squad" is the XI from
  // the side's most recent match rather than everyone who ever played.
  const playerIds = [...m.squads.keys()];
  const fresh = playerIds.filter((id) => !seenPlayers.has(id));
  if (fresh.length > 0) {
    const values: unknown[] = [];
    const tuples: string[] = [];
    for (const id of fresh) {
      const rec = names.get(id);
      const name = rec?.name || m.names.get(id) || id;
      if (!slugs.has(id)) slugs.set(id, await uniqueSlugFor(league, id, name));
      const b = values.length;
      // In cards-only mode a newly seen player is filed under the side they played for
      // that day, with no roster sighting, so they read as a past player of that club.
      values.push(league, id, teamMap.get(m.squads.get(id)!)!.espn_id, name, slugs.get(id), rec?.headshot ?? null, rec?.position ?? null, cardsOnly ? null : `${m.date}T12:00:00Z`);
      tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
      seenPlayers.add(id);
    }
    await pool.query(
      `insert into players (league, espn_id, team_espn_id, name, slug, headshot_url, position, roster_seen_at)
       values ${tuples.join(",")}
       on conflict (league, espn_id) do update set
         name = excluded.name, team_espn_id = case when $${values.length + 1} then players.team_espn_id else excluded.team_espn_id end,
         headshot_url = coalesce(excluded.headshot_url, players.headshot_url),
         position = coalesce(excluded.position, players.position),
         roster_seen_at = greatest(players.roster_seen_at, excluded.roster_seen_at)`,
      [...values, cardsOnly]
    );
  }
  const teamOf = (id: string) => teamMap.get(m.squads.get(id)!)?.espn_id ?? null;
  if (!cardsOnly) await pool.query(
    `update players set team_espn_id = t.team, roster_seen_at = greatest(roster_seen_at, $3::timestamptz)
     from (select unnest($2::text[]) as id, unnest($4::text[]) as team) t
     where players.league = $1 and players.espn_id = t.id`,
    [league, playerIds, `${m.date}T12:00:00Z`, playerIds.map(teamOf)]
  );

  // Per-player match figures in the shape backfill-cricket-player-stats stores.
  const cards = new Map<string, CricketPlayerMatchStats>();
  const card = (id: string) => {
    if (!cards.has(id)) cards.set(id, { athleteId: id, name: names.get(id)?.name || m.names.get(id) || id, teamId: teamOf(id) ?? "" });
    return cards.get(id)!;
  };
  for (const inn of m.innings) {
    for (const b of inn.batters) card(b.id).batting = { runs: b.runs, ballsFaced: b.balls, fours: b.fours, sixes: b.sixes, notOut: !b.out };
    for (const bw of inn.bowlers) card(bw.id).bowling = { overs: Number(oversText(bw.balls, m.ballsPerOver)), conceded: bw.conceded, wickets: bw.wickets };
    for (const [id, n] of inn.catches) card(id).catches = (card(id).catches ?? 0) + n;
  }
  // A fielder can only be on the bowling side; anyone unplaced (a substitute who is
  // somehow in the register) is skipped rather than filed against no team.
  const rows = [...cards.values()].filter((c) => c.teamId);
  if (rows.length > 0) {
    const values: unknown[] = [];
    const tuples = rows.map((c) => {
      const b = values.length;
      values.push(league, m.id, c.athleteId, c.teamId, JSON.stringify({ batting: c.batting, bowling: c.bowling, catches: c.catches }));
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}, now())`;
    });
    await pool.query(
      `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
       values ${tuples.join(",")}
       on conflict (league, game_espn_id, player_espn_id) do update set
         team_espn_id = excluded.team_espn_id, stats = excluded.stats, updated_at = now()`,
      values
    );
  }

  // The stored match report the match page renders (same document the ESPN scraper
  // would produce), so no live ESPN call is needed for these leagues.
  const playerName = (id: string) => names.get(id)?.name || m.names.get(id) || id;
  const scorecard = m.innings.map((inn) => {
    const battingTeam = teamMap.get(inn.team)!;
    return {
      teamId: battingTeam.espn_id,
      teamName: battingTeam.name,
      battingLabels: ["R", "B", "4s", "6s", "SR"],
      battingRows: inn.batters.map((b) => ({
        athleteId: b.id,
        name: playerName(b.id),
        stats: [String(b.runs), String(b.balls), String(b.fours), String(b.sixes), strikeRate(b.runs, b.balls)],
      })),
      bowlingLabels: ["O", "M", "R", "W", "Econ"],
      bowlingRows: inn.bowlers.map((bw) => ({
        athleteId: bw.id,
        name: playerName(bw.id),
        stats: [oversText(bw.balls, m.ballsPerOver), String(bw.maidens), String(bw.conceded), String(bw.wickets), economy(bw.conceded, bw.balls, m.ballsPerOver)],
      })),
    };
  });
  const leaders = m.playerOfMatch.map((id) => {
    const c = cards.get(id);
    const parts: string[] = [];
    if (c?.batting) parts.push(`${c.batting.runs}${c.batting.notOut ? "*" : ""} (${c.batting.ballsFaced})`);
    if (c?.bowling) parts.push(`${c.bowling.wickets}/${c.bowling.conceded}`);
    return { team_id: teamOf(id) ?? "", label: "Player of the Match", athlete_id: id, athlete: playerName(id), value: parts.join(", ") };
  });
  const details = {
    venue: m.venue,
    city: m.city,
    attendance: null,
    officials: m.officials,
    linescores: null,
    events: [],
    lineups: [],
    team_stats: [],
    player_box: [],
    scorecard,
    leaders,
    win_probability: [],
  };
  // Cards-only: keep whatever ESPN's report holds and add the scorecard to it.
  await pool.query(
    `insert into game_details (league, game_espn_id, details, fetched_at) values ($1, $2, $3, now())
     on conflict (league, game_espn_id) do update set
       details = case when $4 then coalesce(game_details.details, '{}'::jsonb) || excluded.details else excluded.details end,
       fetched_at = now()`,
    [league, m.id, JSON.stringify(cardsOnly ? { scorecard, leaders, officials: m.officials, venue: m.venue, city: m.city } : details), cardsOnly]
  );
  return rows.length;
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  const { league, dir, people, names: namesPath, missingOnly, limit } = parseArgs();
  const register = loadRegister(people);

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const parsed: ParsedMatch[] = [];
  let skippedType = 0;
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (data.info?.match_type !== MATCH_TYPE[league] || data.info?.gender !== "male") {
      skippedType++;
      continue;
    }
    const m = parseMatch(f.replace(/\.json$/, ""), data, register);
    if (m) parsed.push(m);
  }
  parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id)));
  console.log(`[import-cricsheet] ${league}: ${parsed.length} matches in ${dir}${skippedType ? ` (${skippedType} files of another type skipped)` : ""}`);

  let queue = parsed;
  // Cards-only: the queue is the stored games with no player rows; each file's two
  // team names are matched onto the game's home/away sides by shared name words
  // ("Royal Challengers Bangalore" -> "Royal Challengers Bengaluru", "Delhi
  // Daredevils" -> "Delhi Capitals", "Kings XI Punjab" -> "Punjab Kings").
  const gameTeams = new Map<string, Map<string, TeamInfo>>();
  if (CARDS_ONLY[league]) {
    const { rows } = await pool.query(
      `select g.espn_id, h.espn_id as home_id, h.name as home_name, h.abbreviation as home_abbr, a.espn_id as away_id, a.name as away_name, a.abbreviation as away_abbr
       from games g
       join teams h on h.league = g.league and h.espn_id = g.home_team_espn_id
       join teams a on a.league = g.league and a.espn_id = g.away_team_espn_id
       where g.league = $1 and g.completed
         and not exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)`,
      [league]
    );
    const targets = new Map(rows.map((r) => [r.espn_id as string, r]));
    const words = (n: string) => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const overlap = (a: string, b: string) => [...words(a)].filter((w) => words(b).has(w)).length;
    queue = [];
    for (const m of parsed) {
      const g = targets.get(m.id);
      if (!g) continue;
      const info = (id: string, name: string, abbr: string | null): TeamInfo => ({ espn_id: id, name, abbreviation: abbr, logo_url: null, color: null, alternate_color: null });
      const straight = overlap(m.teams[0], g.home_name) + overlap(m.teams[1], g.away_name);
      const swapped = overlap(m.teams[0], g.away_name) + overlap(m.teams[1], g.home_name);
      if (straight === swapped) {
        console.warn(`[import-cricsheet] ${league} ${m.id}: cannot tell ${m.teams.join(" / ")} from ${g.home_name} / ${g.away_name}; skipped`);
        continue;
      }
      const [homeName, awayName] = straight > swapped ? m.teams : [m.teams[1], m.teams[0]];
      gameTeams.set(m.id, new Map([[homeName, info(g.home_id, g.home_name, g.home_abbr)], [awayName, info(g.away_id, g.away_name, g.away_abbr)]]));
      queue.push(m);
    }
    console.log(`[import-cricsheet] ${league}: ${targets.size} stored games without scorecards, ${queue.length} found in the archive`);
  } else if (missingOnly) {
    const { rows } = await pool.query(`select espn_id from games where league = $1 and espn_id = any($2)`, [league, parsed.map((m) => m.id)]);
    const have = new Set(rows.map((r) => r.espn_id as string));
    queue = parsed.filter((m) => !have.has(m.id));
    console.log(`[import-cricsheet] ${league}: ${queue.length} not yet stored`);
  }
  queue = queue.slice(0, limit);
  if (queue.length === 0) {
    await pool.end();
    return;
  }

  const playerIds = new Set<string>();
  const teamNames = new Set<string>();
  for (const m of queue) {
    for (const id of m.squads.keys()) playerIds.add(id);
    for (const t of m.teams) teamNames.add(t);
  }
  const names = await resolveNames([...playerIds], namesPath);

  const teamMap = new Map<string, TeamInfo>();
  if (!CARDS_ONLY[league]) {
    const fromAthletes = new Map<string, TeamInfo>();
    for (const rec of names.values()) if (rec.team && teamNames.has(rec.team.name) && !fromAthletes.has(rec.team.name)) fromAthletes.set(rec.team.name, rec.team);
    for (const [k, v] of await buildTeamMap(teamNames, fromAthletes)) teamMap.set(k, v);
    const { rows: existingTeams } = await pool.query(`select espn_id, slug from teams where league = $1`, [league]);
    const teamSlugs = new Map<string, string>(existingTeams.map((r) => [r.espn_id, r.slug]));
    const usedSlugs = new Set(teamSlugs.values());
    for (const t of teamMap.values()) {
      if (!teamSlugs.has(t.espn_id)) {
        const base = slugify(t.name);
        const slug = usedSlugs.has(base) ? `${base}-${t.espn_id}` : base;
        usedSlugs.add(slug);
        teamSlugs.set(t.espn_id, slug);
      }
      await upsertTeam(league, t, teamSlugs.get(t.espn_id)!);
    }
    console.log(`[import-cricsheet] ${league}: ${teamMap.size} teams ready`);
  }

  const { rows: existingPlayers } = await pool.query(`select espn_id, slug from players where league = $1`, [league]);
  const slugs = new Map<string, string>(existingPlayers.map((r) => [r.espn_id, r.slug]));
  const seenPlayers = new Set<string>();
  let games = 0;
  let cardRows = 0;
  for (const m of queue) {
    try {
      cardRows += await writeMatch(league, m, gameTeams.get(m.id) ?? teamMap, names, slugs, seenPlayers);
      games++;
      if (games % 250 === 0) console.log(`[import-cricsheet] ${league}: ${games}/${queue.length} matches written`);
    } catch (err) {
      console.error(`[import-cricsheet] ${league} match ${m.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[import-cricsheet] ${league}: wrote ${games} matches, ${cardRows} player-match rows, ${seenPlayers.size} players`);
  await pool.end();
}

main().catch((err) => {
  console.error("[import-cricsheet] failed:", err);
  process.exit(1);
});
