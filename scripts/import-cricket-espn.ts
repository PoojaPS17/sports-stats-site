// Fills the men's ODI / T20I archive from ESPN for matches Cricsheet does not carry.
//
// Cricsheet (the archive import-cricsheet.ts loads) withholds every match involving
// Afghanistan's men's team, skips a few minor associate fixtures, and publishes a
// match up to a week or two after it ends. Each of those gaps shows up on the site as
// wrong numbers, not as an absence: a season leaders board that omits a batter's
// runs from a missing series, a team's results page with holes, a player's career
// short by every game against Afghanistan. ESPN's cricket API carries all of them.
//
// Discovery uses ESPN's cross-competition daily header feed (one request per day),
// which lists every cricket match on that date with a class card — "ODI" / "T20I"
// for the men's internationals, distinct cards for women's and domestic matches — so
// the sweep needs no per-series ids. A match already stored (from Cricsheet or an
// earlier run of this) is left alone; a missing one is written from its summary in
// exactly the shape the Cricsheet importer produces: game row, team rows, player
// rows, per-player match figures and the stored scorecard.
//
//   npx tsx --env-file=.env.local scripts/import-cricket-espn.ts [--days N | --since YYYY-MM-DD [--until YYYY-MM-DD]] [--league odi|t20i] [--dry-run]
//
// Default window is the last 21 days (the weekly Cricsheet lag plus slack), which the
// daily scrape runs; `--since` sweeps history.
import { pool } from "./lib/db";
import { extractCricketMatchStats } from "./lib/cricket-career";
import { upsertTeam } from "./lib/teams";
import { uniqueSlugFor } from "./lib/players";
import { extractGameDetails } from "../src/lib/matchDetail";

type IntlLeague = "odi" | "t20i" | "wodi" | "wt20i";
// ESPN's `class.internationalClassId`: 2 = men's ODI, 3 = men's T20I (women's
// internationals and every domestic/first-class card use other ids).
const CLASS_TO_LEAGUE: Record<string, IntlLeague> = { "2": "odi", "3": "t20i", "9": "wodi", "10": "wt20i" };

const HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=";
const SUMMARY_URL = (seriesId: string, eventId: string) => `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/summary?event=${eventId}`;
const REQUEST_DELAY_MS = 150;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ESPN's edge answers a slice of requests with 502/504 (a transient — the same URL
// succeeds on retry) and occasionally a non-2xx status wrapped around a valid body.
async function getJson(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`ESPN ${res.status} (${text.length} bytes): ${url}`);
      }
    } catch (err) {
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------------ */
/* Arguments                                                                 */
/* ------------------------------------------------------------------------ */

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const today = new Date();
  const until = opt("until") ? new Date(`${opt("until")}T00:00:00Z`) : today;
  const days = Number(opt("days") ?? 21);
  const since = opt("since") ? new Date(`${opt("since")}T00:00:00Z`) : new Date(until.getTime() - days * 86_400_000);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) {
    console.error("usage: import-cricket-espn.ts [--days N | --since YYYY-MM-DD [--until YYYY-MM-DD]] [--league odi|t20i] [--dry-run]");
    process.exit(1);
  }
  const league = opt("league") as IntlLeague | undefined;
  if (league && !["odi", "t20i", "wodi", "wt20i"].includes(league)) {
    console.error("--league must be odi, t20i, wodi or wt20i");
    process.exit(1);
  }
  return { since, until, league, dryRun: args.includes("--dry-run") };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/* ------------------------------------------------------------------------ */
/* Discovery                                                                 */
/* ------------------------------------------------------------------------ */

interface Found {
  id: string;
  league: IntlLeague;
  seriesId: string;
  date: string;
  name: string;
}

// The feed for a date returns a window around it (matches that started late the
// previous UTC day, or early the next), so a day-by-day sweep sees each match more
// than once; the map dedupes by id.
async function discover(since: Date, until: Date, only: IntlLeague | undefined): Promise<Map<string, Found>> {
  const found = new Map<string, Found>();
  let days = 0;
  for (let d = new Date(since); d <= until; d = new Date(d.getTime() + 86_400_000)) {
    days++;
    let data: any;
    try {
      // A 200 with an empty body shape (no `sports`) is a failed render, not a quiet
      // day — every date returns the sports list, so re-request rather than move on.
      for (let attempt = 0; ; attempt++) {
        data = await getJson(HEADER_URL + ymd(d));
        if (Array.isArray(data?.sports)) break;
        if (attempt >= RETRIES) throw new Error(`no sports list in response (${JSON.stringify(data).slice(0, 120)})`);
        await sleep(1500 * (attempt + 1));
      }
    } catch (err) {
      console.error(`[import-cricket-espn] header feed for ${ymd(d)} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    for (const sport of data?.sports ?? []) {
      for (const lg of sport.leagues ?? []) {
        for (const ev of lg.events ?? []) {
          const league = CLASS_TO_LEAGUE[String(ev.class?.internationalClassId ?? "")];
          if (!league || (only && league !== only)) continue;
          // Only finished matches: a fixture or a match in play has no card yet, and
          // Cricsheet's own import is completed-only too.
          if (ev.status !== "post" || !ev.id) continue;
          if (!found.has(ev.id)) found.set(ev.id, { id: String(ev.id), league, seriesId: String(lg.id), date: ev.date, name: ev.name });
        }
      }
    }
    if (days % 100 === 0) console.log(`[import-cricket-espn] scanned ${days} days, ${found.size} internationals so far`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[import-cricket-espn] scanned ${days} days: ${found.size} completed men's internationals listed`);
  return found;
}

/* ------------------------------------------------------------------------ */
/* Writing one match                                                         */
/* ------------------------------------------------------------------------ */

function leadingRuns(score: unknown): number | null {
  const m = String(score ?? "").match(/^\d+/);
  return m ? Number(m[0]) : null;
}

// The stage, when the match is one ("Final (D/N), ICC Cricket World Cup at ..." →
// "Final"); ordinary "2nd ODI" / "14th Match" descriptions give no round, matching
// what the Cricsheet importer stores.
function stageOf(description: unknown): string | null {
  if (typeof description !== "string") return null;
  const stage = description.split(",")[0].replace(/\s*\([DN/]+\)\s*$/, "").trim();
  return /final|semi|quarter|qualifier|eliminator|play-?off/i.test(stage) ? stage : null;
}

function abbreviationOf(team: any): string {
  if (typeof team?.abbreviation === "string" && team.abbreviation) return team.abbreviation;
  return String(team?.displayName ?? team?.name ?? "")
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
}

// The summary endpoint resolves any cricket event under any competition id in the
// path; ESPN's own IPL id (8048) serves every international fully, while the series
// id from the header feed occasionally returns a copy with no competitors.
const FALLBACK_SERIES = "8048";

async function writeMatch(f: Found, dryRun: boolean): Promise<boolean> {
  let summary = await getJson(SUMMARY_URL(FALLBACK_SERIES, f.id));
  let comp = summary?.header?.competitions?.[0];
  if (!comp?.competitors?.length) {
    summary = await getJson(SUMMARY_URL(f.seriesId, f.id));
    comp = summary?.header?.competitions?.[0];
  }
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  if (!comp || !home?.team?.id || !away?.team?.id) {
    console.error(`[import-cricket-espn] ${f.league} ${f.id} (${f.name}): summary has no competitors, skipped`);
    return false;
  }
  const status = comp.status ?? {};
  if (status.type?.state !== "post") {
    console.error(`[import-cricket-espn] ${f.league} ${f.id} (${f.name}): not finished (${status.type?.state}), skipped`);
    return false;
  }
  const summaryText: string | null = typeof status.summary === "string" && status.summary ? status.summary : null;
  // A match abandoned before a ball was bowled is not an international at all (no
  // toss-and-out counts in the records, and Cricsheet carries none of them), so it
  // must not sit in a team's results as if it were.
  if (/abandoned without a ball/i.test(summaryText ?? "")) {
    console.log(`[import-cricket-espn] ${f.league} ${f.id} (${f.name}): abandoned without a ball bowled, not an international, skipped`);
    return false;
  }
  const { venue, players } = extractCricketMatchStats(summary);
  const rosters: any[] = summary.rosters ?? [];
  const xi = rosters.flatMap((r: any) => (r.roster ?? []).map((p: any) => ({ team: String(r.team?.id ?? ""), athlete: p.athlete })).filter((p: any) => p.team && p.athlete?.id));
  if (xi.length === 0 && players.length === 0) {
    console.error(`[import-cricket-espn] ${f.league} ${f.id} (${f.name}): no scorecard on ESPN, skipped`);
    return false;
  }

  const date = comp.date ?? f.date;
  const noResult = /no result|abandon|cancel/i.test(summaryText ?? "") || (home.winner !== true && away.winner !== true && !/tie/i.test(summaryText ?? ""));
  const homeRuns = leadingRuns(home.score);
  const awayRuns = leadingRuns(away.score);
  const innings = [home, away].flatMap((c: any) => (c.linescores ?? []).filter((l: any) => l.isBatting || Number(l.runs) > 0 || Number(l.overs) > 0)).length;
  const teamLogo = (id: string) => summary.leaders?.find((l: any) => String(l.team?.id) === id)?.team?.logo ?? `https://a.espncdn.com/i/teamlogos/cricket/500/${id}.png`;

  if (dryRun) {
    console.log(`[dry-run] ${f.league} ${f.id} ${date.slice(0, 10)} ${home.team.displayName} v ${away.team.displayName} — ${summaryText ?? "?"}; ${players.length} player cards`);
    return true;
  }

  for (const c of [home, away]) {
    await upsertTeam(f.league, { ...c.team, displayName: c.team.displayName ?? c.team.name, abbreviation: abbreviationOf(c.team), logo: c.team.logo ?? teamLogo(String(c.team.id)) });
  }

  await pool.query(
    `insert into games (
       league, espn_id, date, name, short_name, home_team_espn_id, away_team_espn_id,
       home_score, away_score, home_score_display, away_score_display, home_winner, away_winner,
       season_year, status_state, status_detail, status_summary, round, period, clock, completed, venue, first_seen_date, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'post','Final',$15,$16,$17,null,true,$18,$3, now())
     on conflict (league, espn_id) do update set
       date = excluded.date, name = excluded.name, short_name = excluded.short_name,
       home_team_espn_id = excluded.home_team_espn_id, away_team_espn_id = excluded.away_team_espn_id,
       home_score = excluded.home_score, away_score = excluded.away_score,
       home_score_display = excluded.home_score_display, away_score_display = excluded.away_score_display,
       home_winner = excluded.home_winner, away_winner = excluded.away_winner, season_year = excluded.season_year,
       status_state = excluded.status_state, status_detail = excluded.status_detail, status_summary = excluded.status_summary,
       round = excluded.round, period = excluded.period, completed = true, venue = coalesce(excluded.venue, games.venue), updated_at = now()`,
    [
      f.league,
      f.id,
      date,
      `${home.team.displayName ?? home.team.name} v ${away.team.displayName ?? away.team.name}`,
      `${abbreviationOf(home.team)} v ${abbreviationOf(away.team)}`,
      String(home.team.id),
      String(away.team.id),
      homeRuns,
      awayRuns,
      typeof home.score === "string" && /[^\d]/.test(home.score) ? home.score : null,
      typeof away.score === "string" && /[^\d]/.test(away.score) ? away.score : null,
      noResult ? null : home.winner === true,
      noResult ? null : away.winner === true,
      // Calendar year of the match, as the Cricsheet importer files it — ESPN's own
      // season.year follows the series (a January match of a "2025-26" tour says 2025).
      Number(date.slice(0, 4)),
      summaryText,
      stageOf(comp.description ?? summary.header?.description),
      innings || null,
      venue,
    ]
  );

  // Every player in either XI: created on the side they played for (or moved there —
  // the sweep runs oldest-first, so the last write leaves each on their latest team)
  // with the match date as a roster sighting, the same as the Cricsheet importer.
  type PlayerRow = { id: string; team: string; name: string; headshot: string | null; position: string | null; sighting: string | null };
  const roster = new Map<string, PlayerRow>();
  for (const p of xi) {
    const id = String(p.athlete.id);
    const name: string = p.athlete.displayName ?? p.athlete.fullName ?? p.athlete.name;
    if (roster.has(id) || !name) continue;
    roster.set(id, { id, team: p.team, name, headshot: p.athlete.headshot?.href ?? null, position: p.athlete.position?.name ?? null, sighting: date });
  }
  // A fielder credited on the card but absent from the roster list (a substitute)
  // is filed under the side without counting as a roster sighting.
  for (const p of players) if (!roster.has(p.athleteId)) roster.set(p.athleteId, { id: p.athleteId, team: p.teamId, name: p.name, headshot: null, position: null, sighting: null });

  // Slugs only need computing for players not yet on file (one query for the lot).
  const { rows: known } = await pool.query(`select espn_id from players where league = $1 and espn_id = any($2::text[])`, [f.league, [...roster.keys()]]);
  const knownIds = new Set(known.map((r) => r.espn_id));
  const slugs = new Map<string, string | null>();
  const taken = new Set<string>();
  for (const p of roster.values()) {
    if (knownIds.has(p.id)) {
      slugs.set(p.id, null);
      continue;
    }
    // Two debutants sharing a name in the same match would otherwise collide.
    let slug = await uniqueSlugFor(f.league, p.id, p.name);
    if (taken.has(slug)) slug = `${slug}-${p.id}`;
    taken.add(slug);
    slugs.set(p.id, slug);
  }

  const rows = [...roster.values()];
  await pool.query(
    `insert into players (league, espn_id, team_espn_id, name, slug, headshot_url, position, roster_seen_at)
     select $1, r.id, r.team, r.name, r.slug, r.headshot, r.position, r.sighting
     from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::timestamptz[]) as r(id, team, name, slug, headshot, position, sighting)
     on conflict (league, espn_id) do update set
       name = excluded.name, team_espn_id = excluded.team_espn_id,
       headshot_url = coalesce(excluded.headshot_url, players.headshot_url),
       position = coalesce(excluded.position, players.position),
       roster_seen_at = greatest(players.roster_seen_at, excluded.roster_seen_at)`,
    [
      f.league,
      rows.map((r) => r.id),
      rows.map((r) => r.team),
      rows.map((r) => r.name),
      // Existing rows keep their slug: the insert's slug is only read on a fresh row.
      rows.map((r) => slugs.get(r.id) ?? "pending"),
      rows.map((r) => r.headshot),
      rows.map((r) => r.position),
      rows.map((r) => r.sighting),
    ]
  );

  if (players.length > 0) {
    await pool.query(
      `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
       select $1, $2, r.id, r.team, r.stats::jsonb, now()
       from unnest($3::text[], $4::text[], $5::text[]) as r(id, team, stats)
       on conflict (league, game_espn_id, player_espn_id) do update set
         team_espn_id = excluded.team_espn_id, stats = excluded.stats, updated_at = now()`,
      [f.league, f.id, players.map((p) => p.athleteId), players.map((p) => p.teamId), players.map((p) => JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches }))]
    );
  }

  // The stored match report, plus the player of the match in the slot the Cricsheet
  // importer fills (ESPN's generic extractor leaves cricket's leaders empty).
  const details = extractGameDetails("cricket", summary, String(home.team.id), String(away.team.id));
  const potm = (status.featuredAthletes ?? []).find((a: any) => a.name === "playerOfTheMatch" && a.athlete?.id);
  if (potm) {
    const card = players.find((p) => p.athleteId === String(potm.athlete.id));
    const parts: string[] = [];
    if (card?.batting) parts.push(`${card.batting.runs}${card.batting.notOut ? "*" : ""} (${card.batting.ballsFaced})`);
    if (card?.bowling) parts.push(`${card.bowling.wickets}/${card.bowling.conceded}`);
    const teamId = card?.teamId ?? String(typeof potm.team === "object" ? potm.team?.id ?? "" : potm.team ?? "");
    details.leaders = [{ team_id: teamId, label: "Player of the Match", athlete_id: String(potm.athlete.id), athlete: potm.athlete.displayName ?? potm.athlete.name, value: parts.join(", ") }];
  }
  await pool.query(
    `insert into game_details (league, game_espn_id, details, fetched_at) values ($1, $2, $3, now())
     on conflict (league, game_espn_id) do update set details = excluded.details, fetched_at = now()`,
    [f.league, f.id, JSON.stringify(details)]
  );
  return true;
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  const { since, until, league, dryRun } = parseArgs();
  console.log(`[import-cricket-espn] ${league ?? "odi+t20i"} ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}${dryRun ? " (dry run)" : ""}`);
  const found = await discover(since, until, league);

  // Stored means the game row exists: a washed-out match legitimately has no player
  // figures (from either source), so checking for cards would re-fetch it every run.
  const ids = [...found.values()];
  const { rows: stored } = await pool.query(`select league, espn_id from games where league in ('odi','t20i','wodi','wt20i') and espn_id = any($1::text[])`, [
    ids.map((f) => f.id),
  ]);
  const have = new Set(stored.map((r) => `${r.league}:${r.espn_id}`));
  const missing = ids.filter((f) => !have.has(`${f.league}:${f.id}`)).sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[import-cricket-espn] ${ids.length - missing.length} already stored, ${missing.length} to fetch`);

  const written: Record<IntlLeague, number> = { odi: 0, t20i: 0, wodi: 0, wt20i: 0 };
  let failed = 0;
  for (const f of missing) {
    try {
      if (await writeMatch(f, dryRun)) written[f.league]++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`[import-cricket-espn] ${f.league} ${f.id} (${f.name}) failed: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[import-cricket-espn] done: odi ${written.odi}, t20i ${written.t20i}, wodi ${written.wodi}, wt20i ${written.wt20i} written, ${failed} skipped/failed`);
  await pool.end();
}

main().catch((err) => {
  console.error("[import-cricket-espn] failed:", err);
  process.exit(1);
});
