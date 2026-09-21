// ESPN files a tournament's dates as US Eastern midnights: Valencia (2026) starts 2026-09-13T04:00Z (00:00 EDT on the
// 13th) and ends 2026-09-21T03:59Z (23:59 EDT on the 20th). Reading those in UTC put the end on the 21st, so the page
// said "Sep 13 – 21" (ESPN: 13-20) and the card still said "In play" on the Monday after the final. The stored
// instants stay as they are; every reader converts them to the Eastern calendar day in SQL, and one pure module
// formats the range and decides "In play".
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { easternDateSql, formatTournamentRange, tennisToday, tournamentInPlay } from "../src/lib/tennisDates";

let db: TestDb;
let tennis: typeof import("../src/lib/tennis");
let sitemap: typeof import("../src/lib/sitemap");

before(async () => {
  db = await startTestDb();
  // The app's own pool connects after this, so every query below runs in a session zone that is neither UTC nor
  // Eastern: the dates it returns must not depend on the server's zone.
  await db.pool.query(`alter database t set timezone to 'Pacific/Auckland'`);
  tennis = await import("../src/lib/tennis");
  sitemap = await import("../src/lib/sitemap");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const tournament = (over: Partial<Parameters<typeof tournamentInPlay>[0]> = {}) => ({
  tour: "atp" as "atp" | "wta" | "both",
  start_date: "2026-09-13",
  end_date: "2026-09-20",
  champions: [] as { competition_type: string }[],
  ...over,
});

/* ---- pure helpers ---- */

test("formatTournamentRange reads the Eastern calendar dates it is given, never shifting a day", () => {
  assert.equal(formatTournamentRange("2026-09-13", "2026-09-20"), "Sep 13 – 20, 2026");
  assert.equal(formatTournamentRange("2026-08-31", "2026-09-06"), "Aug 31 – Sep 6, 2026");
  assert.equal(formatTournamentRange("2026-09-13", "2026-09-13"), "Sep 13, 2026");
  assert.equal(formatTournamentRange("2026-09-13", null), "Sep 13, 2026");
  assert.equal(formatTournamentRange(null, "2026-09-20"), null);
  // a full ISO string from an old caller is read by its date part, the same way
  assert.equal(formatTournamentRange("2026-09-13T00:00:00Z", "2026-09-20T00:00:00Z"), "Sep 13 – 20, 2026");
});

test("tournamentInPlay: inside the dates yes, after the last day no, before the first day no", () => {
  assert.equal(tournamentInPlay(tournament(), "2026-09-16"), true);
  assert.equal(tournamentInPlay(tournament(), "2026-09-13"), true);
  assert.equal(tournamentInPlay(tournament(), "2026-09-20"), true);
  assert.equal(tournamentInPlay(tournament(), "2026-09-21"), false);
  assert.equal(tournamentInPlay(tournament(), "2026-09-12"), false);
  assert.equal(tournamentInPlay(tournament({ start_date: null }), "2026-09-16"), false);
});

test("tournamentInPlay: once the singles final is on file the event is not in play, even inside its dates", () => {
  const done = tournament({ champions: [{ competition_type: "mens-singles" }, { competition_type: "mens-doubles" }] });
  assert.equal(tournamentInPlay(done, "2026-09-20"), false);
  // a doubles champion alone is not the singles final
  assert.equal(tournamentInPlay(tournament({ champions: [{ competition_type: "mens-doubles" }] }), "2026-09-20"), true);
  // a Slam (both tours) is in play until both singles finals are decided
  const slam = (champions: string[]) => tournament({ tour: "both", champions: champions.map((competition_type) => ({ competition_type })) });
  assert.equal(tournamentInPlay(slam(["womens-singles"]), "2026-09-13"), true);
  assert.equal(tournamentInPlay(slam(["womens-singles", "mens-singles"]), "2026-09-13"), false);
  // a WTA event needs the women's final, not the men's
  assert.equal(tournamentInPlay(tournament({ tour: "wta", champions: [{ competition_type: "womens-singles" }] }), "2026-09-16"), false);
});

test("tennisToday is the Eastern date: 03:00Z on the 21st is still the 20th", () => {
  assert.equal(tennisToday(new Date("2026-09-21T03:00:00Z")), "2026-09-20");
  assert.equal(tennisToday(new Date("2026-09-21T04:00:00Z")), "2026-09-21");
});

test("easternDateSql names the zone once, for every query", () => {
  assert.match(easternDateSql("t.end_date"), /at time zone 'America\/New_York'/);
});

/* ---- the queries ---- */

const seed = () =>
  db.pool.query(
    `insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, location, major, start_date, end_date)
     values ('9001-2026', 'atp', '9001', 2026, 'Valencia Open', 'Valencia, Spain', false, '2026-09-13T04:00:00Z', '2026-09-21T03:59:00Z'),
            ('9002-2026', 'atp', '9002', 2026, 'Winter Open', null, false, '2026-01-04T05:00:00Z', '2026-01-11T04:59:00Z')`
  );

beforeEach(async () => {
  await db.pool.query(`delete from tennis_matches`);
  await db.pool.query(`delete from tennis_tournaments`);
  await seed();
});

test("getTennisTournament returns the Eastern calendar dates ESPN shows (13 to 20 Sep), not the UTC ones", async () => {
  const t = await tennis.getTennisTournament("9001-2026");
  assert.equal(t?.start_date, "2026-09-13");
  assert.equal(t?.end_date, "2026-09-20");
  assert.equal(formatTournamentRange(t!.start_date, t!.end_date), "Sep 13 – 20, 2026");
  // EST: 05:00Z is midnight, 04:59Z the previous evening
  const w = await tennis.getTennisTournament("9002-2026");
  assert.equal(w?.start_date, "2026-01-04");
  assert.equal(w?.end_date, "2026-01-10");
});

test("getTennisTournaments (the calendar) returns the same dates", async () => {
  const list = await tennis.getTennisTournaments(2026);
  assert.deepEqual(list.map((t) => [t.espn_id, t.start_date, t.end_date]), [["9002-2026", "2026-01-04", "2026-01-10"], ["9001-2026", "2026-09-13", "2026-09-20"]]);
});

test("the hub's in-play window ends with the Eastern last day: in on the 20th, out on the 21st", async () => {
  const around = async (day: string) => (await tennis.getTennisTournamentsAround(day)).map((t) => t.espn_id);
  assert.ok((await around("2026-09-20")).includes("9001-2026"));
  assert.ok(!(await around("2026-09-21")).includes("9001-2026"), "the day after the final is not in play");
  assert.ok((await around("2026-09-06")).includes("9001-2026"), "and it is listed the week before it starts");
});

test("the sitemap's lastmod for a tournament is its Eastern last day", async () => {
  const entries = await sitemap.sitemapEntries("core");
  const e = entries.find((x) => x.url.endsWith("/tennis/tournaments/9001-2026"));
  assert.ok(e, "tournament is listed");
  assert.equal(new Date(e.lastModified as string | Date).toISOString().slice(0, 10), "2026-09-20");
});
