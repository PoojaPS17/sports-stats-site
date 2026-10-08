import { test } from "node:test";
import assert from "node:assert/strict";
import { HERO_FALLBACK_COLOUR, heroLine, heroTeamColours, type LoadedBlock } from "../src/lib/homeHeroLine";
import type { HomeBlock, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData, F1DriversBlockData } from "../src/lib/blockTypes";

const now = new Date("2026-09-30T14:00:00Z");
const opts = { now, formatTime: (iso: string) => new Date(iso).toISOString().slice(11, 16), formatDay: (iso: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso).getUTCDay()] };

const block = (type: HomeBlock["type"], label: string): HomeBlock => ({ id: `${type}:${label}`, type, params: {}, label });

const kohli: LoadedBlock = {
  block: block("player-form", "Kohli: last five"),
  data: { player: { name: "Kohli", href: "/ipl/players/virat-kohli", team: "RCB" }, statLabel: "Runs", verb: "made", games: [{ id: "1", date: "2026-09-28", opponent: "Australia", value: 102, display: "102*", href: "/x" }] } satisfies PlayerFormBlockData,
};
const indiaLive: LoadedBlock = {
  block: block("team-next", "India: next three"),
  data: { team: { name: "India", href: "/x", color: null }, last: null, next: [{ id: "m1", date: "2026-09-30T13:30:00Z", opponent: "Australia", home: true, href: "/x", score: "142/3", result: null, live: true, status: "22 balls left", league: "cricket" }] } satisfies TeamNextBlockData,
};
const arsenalToday: LoadedBlock = {
  block: block("team-next", "Arsenal: next three"),
  data: { team: { name: "Arsenal", href: "/x", color: null }, last: null, next: [{ id: "g1", date: "2026-09-30T14:10:00Z", opponent: "Chelsea", home: true, href: "/x", score: null, result: null, live: false, status: null, league: "epl" }] } satisfies TeamNextBlockData,
};
const f1: LoadedBlock = {
  block: block("f1-drivers", "F1: driver standings"),
  data: { season: 2026, rows: [], nextRace: { name: "Singapore Grand Prix", href: "/x", raceIso: "2026-10-04T12:00:00Z", circuitTimeZone: "Asia/Singapore" } } satisfies F1DriversBlockData,
};
const epl: LoadedBlock = {
  block: block("standings", "Premier League standings"),
  data: { label: "Premier League", href: "/x", record: false, rows: [{ position: 1, name: "Arsenal", href: "/x", played: 6, figure: "19", netRunRate: null, zone: "zone-1", color: null }, { position: 2, name: "Liverpool", href: "/x", played: 6, figure: "18", netRunRate: null, zone: "zone-1", color: null }] } satisfies StandingsBlockData,
};
const liveEmpty: LoadedBlock = { block: block("live", "Live in your blocks"), data: { games: [], cricket: [], tennis: [] } satisfies LiveBlockData };

// The fixture sits ten minutes after `now`, so "today" holds in every time zone the suite may run in.
test("the visitor's live team leads, then their player's last score; the sub takes the next two facts", () => {
  const out = heroLine([liveEmpty, indiaLive, kohli, arsenalToday, f1, epl], opts);
  assert.equal(out.headline, "India 142/3 v Australia, 22 balls left. Kohli made 102* last time out.");
  assert.equal(out.sub, "Arsenal v Chelsea at 14:10. Singapore Grand Prix Sun 12:00.");
});

test("a standings leader fills in when nothing is live or due, and an entity is never repeated", () => {
  const out = heroLine([liveEmpty, arsenalToday, epl], opts);
  assert.equal(out.headline, "Arsenal v Chelsea at 14:10.");
  assert.equal(out.sub, "");
});

test("records read as 'ahead at', points as 'by N points'", () => {
  const nfl: LoadedBlock = { block: block("standings", "NFL standings"), data: { ...(epl.data as StandingsBlockData), label: "NFL", record: true, rows: [{ position: 1, name: "Chiefs", href: "/x", played: 4, figure: "4-0", netRunRate: null, zone: null, color: null }] } };
  assert.equal(heroLine([nfl], opts).headline, "Chiefs lead the NFL at 4-0.");
  assert.equal(heroLine([epl], opts).headline, "Arsenal lead the Premier League by 1 point.");
});

test("the live block counts games across sports and the fallback names the counts", () => {
  const live: LoadedBlock = { block: block("live", "Live in your blocks"), data: { games: [{} as never, {} as never], cricket: [{} as never], tennis: [] } };
  const out = heroLine([live, { block: block("bts", "Beyond the Scoreline"), data: null }], opts);
  assert.equal(out.liveCount, 3);
  assert.equal(out.headline, "Your 2 blocks, 3 live.");
  assert.equal(out.sub, "");
});

test("a fixture on another day is not 'today'", () => {
  const tomorrow: LoadedBlock = { ...arsenalToday, data: { ...(arsenalToday.data as TeamNextBlockData), next: [{ ...(arsenalToday.data as TeamNextBlockData).next[0], date: "2026-10-01T14:10:00Z" }] } };
  assert.equal(heroLine([tomorrow], opts).headline, "Your 1 block, 0 live.");
});

const team = (name: string, color: string | null): LoadedBlock => ({
  block: block("team-next", `${name}: next three`),
  data: { team: { name, href: "/x", color }, last: null, next: [] } satisfies TeamNextBlockData,
});

test("the hero glows with the first two different team colours, in block order", () => {
  assert.deepEqual(heroTeamColours([liveEmpty, team("Eastmere", "8b1e3f"), team("Coral Coast", "#0E7490"), team("Third", "123456")]), ["#8b1e3f", "#0e7490"]);
});

test("one team gives its colour twice, a repeated colour is skipped, and no team colour gives the brand blue", () => {
  assert.deepEqual(heroTeamColours([team("Eastmere", "8b1e3f")]), ["#8b1e3f", "#8b1e3f"]);
  assert.deepEqual(heroTeamColours([team("A", "8b1e3f"), team("B", "8B1E3F"), team("C", "0e7490")]), ["#8b1e3f", "#0e7490"]);
  assert.deepEqual(heroTeamColours([liveEmpty, team("India", null), team("Odd", "not-a-colour")]), [HERO_FALLBACK_COLOUR, HERO_FALLBACK_COLOUR]);
});
