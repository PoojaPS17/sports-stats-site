// Day-by-day tennis from ESPN's cross-tour daily listing — the feed behind ESPN's own
// tennis scores page: every match in every tournament ESPN tracks (tour events,
// Slams, Challengers, 125s), singles and doubles, with round and court, seeds,
// set-by-set scores with tie-breaks, and each player's country.
//
// The older fetch-tennis-scores.ts read the per-tour scoreboard, which only ever
// returns the tournaments in play that moment, singles only, with a bare score
// string — and no way to reach any other day. This feed honours a date, so the same
// pass serves the live window and a full historical backfill.
//
//   npx tsx --env-file=.env.local scripts/fetch-tennis-daily.ts                     # last 3 days + next 7
//   npx tsx --env-file=.env.local scripts/fetch-tennis-daily.ts --since 2016-01-01  # backfill
//   npx tsx --env-file=.env.local scripts/fetch-tennis-daily.ts --calendar 2026     # season calendar (dates, venues)
//
// Matches are filed under the calendar date ESPN lists them on (US Eastern), which
// is how its scores page groups a day. Players new to the database get one detail
// request each (full name, country, headshot); a scheduled run caps that so a big
// day cannot stall the scrape — the next run picks up the rest.
import { pool } from "./lib/db";
import { fetchTennisDay, fetchTennisEvent, fetchTennisSeasonEventRefs, fetchTennisAthlete, fetchByRef, type Tour } from "./lib/tennis";
import { uniqueSlugFor } from "./lib/players";
import { isCalledOff } from "../src/lib/gameStatus";

const REQUEST_DELAY_MS = 120;
const LEAGUE_TOUR: Record<string, Tour> = { "851": "atp", "900": "wta" };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const days = Number(opt("days") ?? 3);
  const ahead = Number(opt("ahead") ?? 7);
  const since = opt("since") ? new Date(`${opt("since")}T12:00:00Z`) : new Date(today.getTime() - days * 86_400_000);
  const until = opt("until") ? new Date(`${opt("until")}T12:00:00Z`) : new Date(today.getTime() + ahead * 86_400_000);
  const calendarArg = opt("calendar");
  const calendar = args.includes("--calendar") ? (calendarArg && /^\d{4}$/.test(calendarArg) ? Number(calendarArg) : today.getUTCFullYear()) : null;
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) {
    console.error("usage: fetch-tennis-daily.ts [--days N] [--ahead M] | [--since YYYY-MM-DD [--until YYYY-MM-DD]] [--calendar [year]] [--dry-run]");
    process.exit(1);
  }
  // A backfill (explicit --since) fetches every new player's details; the scheduled
  // window caps that per run.
  const playerCap = opt("since") ? Infinity : Number(opt("player-cap") ?? 300);
  return { since, until, calendar, dryRun: args.includes("--dry-run"), playerCap };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// The calendar date ESPN files a match under: its scores page is a US Eastern day.
function easternDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/* ------------------------------------------------------------------------ */
/* Parsing one match                                                         */
/* ------------------------------------------------------------------------ */

interface Side {
  ids: string[];
  names: string[];
  countries: (string | null)[];
  seed: number | null;
  rank: number | null;
  score: string | null;
  sets: { games: number; tiebreak: number | null; winner: boolean }[];
}

interface ParsedMatch {
  id: string;
  tour: Tour;
  tournamentId: string;
  tournamentName: string;
  type: string;
  round: string | null;
  roundNumber: number | null;
  court: string | null;
  date: string;
  day: string;
  completed: boolean;
  statusState: string | null;
  statusDetail: string | null;
  winnerSide: 1 | 2 | null;
  sides: [Side, Side];
}

function countryFromLogo(url: unknown): string | null {
  const m = typeof url === "string" ? url.match(/countries\/500\/([a-z]{2,3})\.png/i) : null;
  return m ? m[1].toUpperCase() : null;
}

// The feed's note gives the result in full names — "(4) Aneta Kucmova (CZE) & Aneta
// Laboutkova (CZE) bt Alevtina Ibragimova (RUS) & Ksenia Zaytseva (RUS) 4-6 6-2" —
// which is the only place a doubles pair's full names appear (the competitor row
// abbreviates them to "A. Kucmova / A. Laboutkova").
function namesFromNote(text: string | undefined, winnerFirst: boolean): [{ names: string[]; countries: string[] }, { names: string[]; countries: string[] }] | null {
  if (!text) return null;
  const parts = text.split(/\s+(?:bt|def\.?|d\.)\s+/);
  if (parts.length !== 2) return null;
  const parse = (s: string) => {
    const names: string[] = [];
    const countries: string[] = [];
    for (const m of s.matchAll(/(?:\((?:\d+|[A-Z]+)\)\s*)?([^()&]+?)\s*\(([A-Z]{3})\)/g)) {
      names.push(m[1].trim());
      countries.push(m[2]);
    }
    return { names, countries };
  };
  const a = parse(parts[0]);
  const b = parse(parts[1]);
  if (a.names.length === 0 || b.names.length === 0) return null;
  return winnerFirst ? [a, b] : [b, a];
}

function parseSide(c: any): Side {
  const ids = String(c.id ?? "").split("-").filter((s) => /^\d+$/.test(s));
  const names = String(c.displayName ?? c.name ?? "")
    .split(" / ")
    .map((s) => s.trim())
    .filter(Boolean);
  const country = countryFromLogo(c.logo);
  const sets = (c.linescores ?? [])
    .filter((l: any) => typeof l.setScore === "number" || typeof l.score === "number")
    .map((l: any) => ({ games: Number(l.setScore ?? l.score), tiebreak: typeof l.tiebreak === "number" ? l.tiebreak : null, winner: l.winner === true }));
  return {
    ids,
    names,
    countries: names.map((_, i) => (i === 0 ? country : null)),
    seed: typeof c.tournamentSeed === "number" ? c.tournamentSeed : null,
    rank: typeof c.rank === "number" ? c.rank : null,
    score: typeof c.score === "string" && c.score ? c.score : null,
    sets,
  };
}

function parseEvent(leagueId: string, e: any): ParsedMatch | null {
  const type: string = e.competitionType?.slug ?? "";
  if (!type || !e.competitionId || !e.date) return null;
  const competitors: any[] = e.competitors ?? [];
  if (competitors.length !== 2) return null;
  // A slot not yet decided ("TBD", negative placeholder id) is not a match to store.
  if (competitors.some((c) => !/^\d+(-\d+)?$/.test(String(c.id ?? "")) || /^tbd$/i.test(String(c.displayName ?? "")))) return null;

  const tour: Tour = type.startsWith("womens") ? "wta" : type.startsWith("mens") ? "atp" : (LEAGUE_TOUR[leagueId] ?? "atp");
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  const sides: [Side, Side] = [parseSide(home), parseSide(away)];

  const note = (e.notes ?? [])[0];
  const noteType: string = typeof note?.type === "string" ? note.type : "";
  const [round, court] = noteType.includes(" - ") ? noteType.split(/\s+-\s+/, 2) : [noteType || null, null];
  const state: string | null = e.fullStatus?.type?.state ?? e.status ?? null;
  // ESPN files a called-off match under state "post" too, so "post" alone does not make a match finished: a
  // postponed or cancelled one has completed false and is not a result (same rule as src/lib/tennisFeed.ts).
  const completed = e.fullStatus?.type?.completed === true || (state === "post" && !isCalledOff(e.fullStatus?.type?.detail ?? e.summary));
  const winnerSide: 1 | 2 | null = home.winner === true ? 1 : away.winner === true ? 2 : null;

  // Full names and both countries from the result note, when there is one.
  const full = completed && winnerSide ? namesFromNote(note?.text, winnerSide === 1) : null;
  if (full) {
    for (const i of [0, 1] as const) {
      if (full[i].names.length === sides[i].ids.length || sides[i].names.length !== sides[i].ids.length) {
        sides[i].names = full[i].names;
        sides[i].countries = full[i].countries;
      } else {
        sides[i].countries = sides[i].countries.map((c, j) => c ?? full[i].countries[j] ?? null);
      }
    }
  }

  return {
    id: String(e.competitionId),
    tour,
    tournamentId: String(e.id),
    tournamentName: String(e.name ?? e.shortName ?? ""),
    type,
    round: round ? round.trim() : null,
    roundNumber: typeof e.round === "number" ? e.round : null,
    court: court ? court.trim() : null,
    date: e.date,
    day: easternDay(e.date),
    completed,
    statusState: state,
    statusDetail: e.fullStatus?.type?.detail ?? e.summary ?? null,
    winnerSide,
    sides,
  };
}

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

async function upsertTournaments(rows: Map<string, { tour: Tour; name: string; location: string | null; major: boolean; season: number }>) {
  for (const [id, t] of rows) {
    await pool.query(
      `insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, location, major, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (espn_id) do update set
         tour = case when tennis_tournaments.tour = excluded.tour then excluded.tour else 'both' end,
         name = excluded.name, location = coalesce(excluded.location, tennis_tournaments.location),
         major = tennis_tournaments.major or excluded.major, updated_at = now()`,
      [id, t.tour, id.split("-")[0], t.season, t.name, t.location, t.major]
    );
  }
}

// Players: every id on either side, under the tour the match belongs to. Full details
// (name as ESPN spells it, country, headshot) come from one athlete request for ids
// not yet on file; a pair's abbreviated "A. Kucmova" is only a placeholder until then.
async function upsertPlayers(matches: ParsedMatch[], fetched: Set<string>, budget: { left: number }) {
  const wanted = new Map<string, { tour: Tour; name: string; country: string | null; abbreviated: boolean }>();
  for (const m of matches) {
    // Mixed doubles pairs one player from each tour; their rows live under their own
    // tour already (or will, from their singles/doubles play), so nothing is filed.
    if (m.type === "mixed-doubles") continue;
    for (const side of m.sides) {
      side.ids.forEach((id, i) => {
        const name = side.names[i] ?? side.names[0] ?? id;
        const key = `${m.tour}:${id}`;
        const abbreviated = /^[A-Z]\.\s/.test(name);
        const prev = wanted.get(key);
        if (!prev || (prev.abbreviated && !abbreviated)) wanted.set(key, { tour: m.tour, name, country: side.countries[i] ?? null, abbreviated });
      });
    }
  }
  if (wanted.size === 0) return;

  const { rows: known } = await pool.query(
    `select league, espn_id, country, headshot_url, name from players where (league, espn_id) in (select unnest($1::text[]), unnest($2::text[]))`,
    [[...wanted.values()].map((w) => w.tour), [...wanted.keys()].map((k) => k.split(":")[1])]
  );
  const knownMap = new Map(known.map((r) => [`${r.league}:${r.espn_id}`, r]));

  for (const [key, w] of wanted) {
    const id = key.split(":")[1];
    const existing = knownMap.get(key);
    // Detail fetch: once per player, for new rows and for rows missing a country.
    let detail: any = null;
    if ((!existing || !existing.country) && !fetched.has(id) && budget.left > 0) {
      fetched.add(id);
      budget.left--;
      try {
        detail = await fetchTennisAthlete(id);
      } catch {
        detail = null;
      }
      await sleep(REQUEST_DELAY_MS);
    }
    const name: string = detail?.displayName ?? detail?.fullName ?? (existing && !/^[A-Z]\.\s/.test(existing.name) ? existing.name : w.name);
    const country = countryFromLogo(detail?.flag?.href) ?? w.country ?? existing?.country ?? null;
    const headshot = detail?.headshot?.href ?? null;
    if (existing && existing.name === name && (country ?? null) === (existing.country ?? null) && !headshot) continue;
    const slug = existing ? null : await uniqueSlugFor(w.tour, id, name);
    await pool.query(
      `insert into players (league, espn_id, name, slug, headshot_url, country)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (league, espn_id) do update set
         name = excluded.name,
         headshot_url = coalesce(excluded.headshot_url, players.headshot_url),
         country = coalesce(excluded.country, players.country)`,
      [w.tour, id, name, slug ?? "pending", headshot, country]
    );
  }
}

async function upsertMatches(matches: ParsedMatch[]) {
  if (matches.length === 0) return;
  const col = <T>(f: (m: ParsedMatch) => T) => matches.map(f);
  await pool.query(
    `insert into tennis_matches (
       tour, espn_id, tournament_name, round, date, player1_espn_id, player2_espn_id, score_display, winner_espn_id,
       completed, status_state, status_detail, tournament_espn_id, competition_type, round_number, court, day, side1, side2, updated_at
     )
     select r.tour, r.id, r.tournament_name, r.round, r.date, r.p1, r.p2, r.score, r.winner, r.completed, r.state, r.detail,
            r.tournament, r.type, r.round_number, r.court, r.day::date, r.side1::jsonb, r.side2::jsonb, now()
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::text[], $7::text[], $8::text[], $9::text[],
                 $10::boolean[], $11::text[], $12::text[], $13::text[], $14::text[], $15::int[], $16::text[], $17::text[], $18::text[], $19::text[])
       as r(tour, id, tournament_name, round, date, p1, p2, score, winner, completed, state, detail, tournament, type, round_number, court, day, side1, side2)
     on conflict (tour, espn_id) do update set
       tournament_name = excluded.tournament_name, round = excluded.round, date = excluded.date,
       player1_espn_id = excluded.player1_espn_id, player2_espn_id = excluded.player2_espn_id,
       score_display = excluded.score_display, winner_espn_id = excluded.winner_espn_id,
       completed = excluded.completed, status_state = excluded.status_state, status_detail = excluded.status_detail,
       tournament_espn_id = excluded.tournament_espn_id, competition_type = excluded.competition_type,
       round_number = excluded.round_number, court = coalesce(excluded.court, tennis_matches.court), day = excluded.day,
       side1 = excluded.side1, side2 = excluded.side2, updated_at = now()`,
    [
      col((m) => m.tour),
      col((m) => m.id),
      col((m) => m.tournamentName),
      col((m) => m.round),
      col((m) => m.date),
      col((m) => m.sides[0].ids[0]),
      col((m) => m.sides[1].ids[0]),
      col((m) => (m.winnerSide ? m.sides[m.winnerSide - 1].score : null)),
      col((m) => (m.winnerSide ? m.sides[m.winnerSide - 1].ids[0] : null)),
      col((m) => m.completed),
      col((m) => m.statusState),
      col((m) => m.statusDetail),
      col((m) => m.tournamentId),
      col((m) => m.type),
      col((m) => m.roundNumber),
      col((m) => m.court),
      col((m) => m.day),
      col((m) => JSON.stringify(m.sides[0])),
      col((m) => JSON.stringify(m.sides[1])),
    ]
  );
}

/* ------------------------------------------------------------------------ */
/* Tournament dates and the season calendar                                  */
/* ------------------------------------------------------------------------ */

async function upsertEventDetail(tour: Tour, ev: any) {
  if (!ev?.id || !ev.name) return;
  const loc = ev.location ? [ev.location.city, ev.location.country].map((s: unknown) => String(s ?? "").trim()).filter(Boolean).join(", ") : null;
  await pool.query(
    `insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, location, major, start_date, end_date, updated_at)
     values ($1, $2, $3, $4, $5, $6, false, $7, $8, now())
     on conflict (espn_id) do update set
       tour = case when tennis_tournaments.tour = excluded.tour then excluded.tour else 'both' end,
       name = excluded.name, location = coalesce(excluded.location, tennis_tournaments.location),
       start_date = excluded.start_date, end_date = excluded.end_date, updated_at = now()`,
    [String(ev.id), tour, String(ev.id).split("-")[0], Number(String(ev.id).split("-")[1]) || new Date(ev.date).getUTCFullYear(), ev.name, loc, ev.date ?? null, ev.endDate ?? null]
  );
}

// Exact dates for tournaments seen in the day feed that have none yet.
async function fillTournamentDates(limit: number) {
  const { rows } = await pool.query(`select espn_id, tour from tennis_tournaments where start_date is null order by season desc limit $1`, [limit]);
  let n = 0;
  for (const r of rows) {
    const tour: Tour = r.tour === "wta" ? "wta" : "atp";
    try {
      await upsertEventDetail(tour, await fetchTennisEvent(tour, r.espn_id));
      n++;
    } catch (err) {
      console.error(`[fetch-tennis-daily] event ${r.espn_id} detail failed: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  if (rows.length > 0) console.log(`[fetch-tennis-daily] tournament dates filled for ${n}/${rows.length}`);
}

async function importCalendar(year: number) {
  for (const tour of ["atp", "wta"] as Tour[]) {
    let n = 0;
    try {
      const list = await fetchTennisSeasonEventRefs(tour, year);
      for (const item of list.items ?? []) {
        try {
          await upsertEventDetail(tour, await fetchByRef<any>(item.$ref));
          n++;
        } catch (err) {
          console.error(`[fetch-tennis-daily] ${tour} ${year} event failed: ${err instanceof Error ? err.message : err}`);
        }
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      console.error(`[fetch-tennis-daily] ${tour} ${year} calendar failed: ${err instanceof Error ? err.message : err}`);
    }
    console.log(`[fetch-tennis-daily] calendar ${tour} ${year}: ${n} tournaments`);
  }
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  const { since, until, calendar, dryRun, playerCap } = parseArgs();
  if (calendar) await importCalendar(calendar);

  console.log(`[fetch-tennis-daily] ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}${dryRun ? " (dry run)" : ""}`);
  const fetched = new Set<string>();
  const budget = { left: playerCap };
  let days = 0;
  let total = 0;
  const seenTournaments = new Map<string, { tour: Tour; name: string; location: string | null; major: boolean; season: number }>();

  for (let d = new Date(since); d <= until; d = new Date(d.getTime() + 86_400_000)) {
    days++;
    let data: any;
    try {
      data = await fetchTennisDay(ymd(d));
      if (!Array.isArray(data?.sports)) throw new Error("no sports list in response");
    } catch (err) {
      console.error(`[fetch-tennis-daily] ${ymd(d)} failed: ${err instanceof Error ? err.message : err}`);
      await sleep(1000);
      continue;
    }
    const matches: ParsedMatch[] = [];
    const tournaments = new Map<string, { tour: Tour; name: string; location: string | null; major: boolean; season: number }>();
    for (const sport of data.sports ?? []) {
      for (const lg of sport.leagues ?? []) {
        const leagueTour = LEAGUE_TOUR[String(lg.id)] ?? "atp";
        for (const ev of lg.events ?? []) {
          if (ev.id && ev.name) {
            const prev = tournaments.get(String(ev.id)) ?? seenTournaments.get(String(ev.id));
            tournaments.set(String(ev.id), {
              tour: prev && prev.tour !== leagueTour ? ("both" as Tour) : leagueTour,
              name: String(ev.name),
              location: typeof ev.location === "string" ? ev.location : null,
              major: ev.major === true,
              season: Number(ev.season) || Number(String(ev.id).split("-")[1]) || d.getUTCFullYear(),
            });
          }
          const m = parseEvent(String(lg.id), ev);
          if (m) matches.push(m);
        }
      }
    }
    // The feed for a day is a window around it; each match keeps the day it is filed
    // under, and the same match seen again from a neighbouring day just re-upserts.
    if (!dryRun) {
      await upsertTournaments(tournaments);
      for (const [k, v] of tournaments) seenTournaments.set(k, v);
      await upsertPlayers(matches, fetched, budget);
      await upsertMatches(matches);
    }
    total += matches.length;
    if (dryRun && matches.length > 0) {
      for (const m of matches.slice(0, 4)) console.log(`  ${m.day} ${m.tour} ${m.tournamentName} ${m.type} ${m.round ?? ""}${m.court ? ` @ ${m.court}` : ""}: ${m.sides[0].names.join(" / ")} v ${m.sides[1].names.join(" / ")} — ${m.sides[m.winnerSide === 2 ? 1 : 0].score ?? m.statusDetail}`);
    }
    if (days % 50 === 0) console.log(`[fetch-tennis-daily] ${days} days, ${total} matches so far`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[fetch-tennis-daily] ${days} days: ${total} matches, ${fetched.size} player details fetched`);
  if (!dryRun) await fillTournamentDates(playerCap === Infinity ? 1000 : 40);
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-tennis-daily] failed:", err);
  process.exit(1);
});
