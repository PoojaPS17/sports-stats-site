// Which of ESPN's per-season rows the season-stats loader stores. Pure: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTotalsRow, SEASON_YEARS_BACK, seasonGamesPlayed, seasonRow, seasonWindowStart } from "../scripts/lib/season-row";

// Luka Doncic's 2025 in ESPN's athlete /stats: one row per team plus a whole-season "Totals" row.
const luka = {
  name: "averages",
  labels: ["GP", "PTS"],
  statistics: [
    { season: { year: 2024 }, teamSlug: "dallas-mavericks", displayName: "2023-24", stats: ["70", "33.9"] },
    { season: { year: 2025 }, teamSlug: "dallas-mavericks", displayName: "2024-25", stats: ["22", "28.1"] },
    { season: { year: 2025 }, teamSlug: "los-angeles-lakers", displayName: "2024-25", stats: ["28", "28.2"] },
    { season: { year: 2025 }, teamSlug: "2024-25 Totals", displayName: "2024-25  Totals", stats: ["50", "28.2"] },
  ],
};

test("a traded player's season is ESPN's Totals row, not the first team's stint", () => {
  assert.deepEqual(seasonRow(luka, 2025), { labels: ["GP", "PTS"], values: ["50", "28.2"] });
});

test("the Totals row is found whichever position it has among the season's rows", () => {
  const totalsFirst = { ...luka, statistics: [luka.statistics[3], luka.statistics[1], luka.statistics[2]] };
  assert.deepEqual(seasonRow(totalsFirst, 2025)?.values, ["50", "28.2"]);
  const named = { labels: ["GP"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["10"] }, { season: { year: 2025 }, displayName: "Totals", stats: ["30"] }] };
  assert.deepEqual(seasonRow(named, 2025)?.values, ["30"]);
});

test("a player with one row for the season gets that row", () => {
  assert.deepEqual(seasonRow(luka, 2024), { labels: ["GP", "PTS"], values: ["70", "33.9"] });
});

test("a season with no rows is null", () => {
  assert.equal(seasonRow(luka, 2030), null);
  assert.equal(seasonRow({ labels: ["GP"] }, 2025), null);
  assert.equal(seasonRow({ labels: ["GP"], statistics: [] }, 2025), null);
});

test("another season's Totals row is not the row for this season", () => {
  const category = {
    labels: ["GP", "PTS"],
    statistics: [
      { season: { year: 2025 }, teamSlug: "dallas-mavericks", stats: ["22", "28.1"] },
      { season: { year: 2024 }, teamSlug: "2023-24 Totals", displayName: "2023-24  Totals", stats: ["70", "33.9"] },
    ],
  };
  assert.deepEqual(seasonRow(category, 2025)?.values, ["22", "28.1"]);
  // A season whose only row is another season's Totals row has nothing.
  assert.equal(seasonRow({ labels: category.labels, statistics: [category.statistics[1]] }, 2025), null);
});

test("with a league given, the first row of that league is taken, as before", () => {
  const category = {
    labels: ["GP", "PTS"],
    statistics: [
      { season: { year: 2025 }, leagueSlug: "esp.1", teamSlug: "a", stats: ["22", "28.1"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "b", stats: ["28", "28.2"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "2024-25 Totals", displayName: "Totals", stats: ["50", "28.2"] },
    ],
  };
  assert.deepEqual(seasonRow(category, 2025, "eng.1")?.values, ["28", "28.2"]);
  assert.equal(seasonRow(category, 2025, "ger.1"), null);
});

test("a soccer-shaped category is read by season and league, first match, exactly as before", () => {
  const soccer = {
    name: "offensive",
    labels: ["GP", "G", "A"],
    statistics: [
      { season: { year: 2025 }, leagueSlug: "fra.1", teamSlug: "psg", stats: ["30", "9", "4"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "arsenal", stats: ["20", "5", "3"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "chelsea", stats: ["10", "2", "1"] },
      { season: { year: 2024 }, leagueSlug: "eng.1", teamSlug: "arsenal", stats: ["35", "11", "6"] },
    ],
  };
  assert.deepEqual(seasonRow(soccer, 2025, "eng.1"), { labels: ["GP", "G", "A"], values: ["20", "5", "3"] });
  assert.deepEqual(seasonRow(soccer, 2024, "eng.1")?.values, ["35", "11", "6"]);
  assert.equal(seasonRow(soccer, 2024, "fra.1"), null);
});

test("a category without labels or stats still gives arrays", () => {
  assert.deepEqual(seasonRow({ statistics: [{ season: { year: 2025 } }] }, 2025), { labels: [], values: [] });
});

test("isTotalsRow reads the team slug and the display name", () => {
  assert.equal(isTotalsRow({ teamSlug: "2024-25 Totals" }), true);
  assert.equal(isTotalsRow({ displayName: "2024-25  Totals" }), true);
  assert.equal(isTotalsRow({ displayName: "Total" }), true);
  assert.equal(isTotalsRow({ teamSlug: "los-angeles-lakers", displayName: "2024-25" }), false);
  assert.equal(isTotalsRow({ teamSlug: "subtotals-fc" }), false);
  assert.equal(isTotalsRow({}), false);
});

// ESPN's NFL athlete /stats repeats the player's games played (first label, "GP") in every category
// for a row's team, so a season's games are read from GP, not from the box-score rows the site stores.
const nflLabels = { passing: ["GP", "CMP", "YDS"], rushing: ["GP", "CAR", "YDS"], receiving: ["GP", "REC", "YDS"], defensive: ["GP", "TOT", "SACK"] };
const nflRow = (year: number, teamSlug: string, gp: string, displayName = String(year)) => ({ season: { year }, teamSlug, displayName, stats: [gp, "1", "2"] });
const nflCategory = (name: keyof typeof nflLabels, statistics: ReturnType<typeof nflRow>[]) => ({ name, labels: nflLabels[name], statistics });

test("a one-team NFL season is that team's GP, the same in every category", () => {
  const categories = [
    nflCategory("passing", [nflRow(2024, "kansas-city-chiefs", "16"), nflRow(2025, "kansas-city-chiefs", "15")]),
    nflCategory("rushing", [nflRow(2024, "kansas-city-chiefs", "16"), nflRow(2025, "kansas-city-chiefs", "15")]),
    nflCategory("receiving", [nflRow(2025, "kansas-city-chiefs", "15")]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2025), 15);
  assert.equal(seasonGamesPlayed(categories, 2024), 16);
});

test("categories that disagree on one team's GP give the largest", () => {
  const categories = [
    nflCategory("receiving", [nflRow(2025, "tampa-bay-buccaneers", "9")]),
    nflCategory("defensive", [nflRow(2025, "tampa-bay-buccaneers", "16")]),
    nflCategory("rushing", [nflRow(2025, "tampa-bay-buccaneers", "12")]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2025), 16);
});

test("a traded player with a Totals row gets the larger of the Totals GP and the sum, wherever the row sits", () => {
  const car = nflRow(2022, "carolina-panthers", "6");
  const sf = nflRow(2022, "san-francisco-49ers", "11");
  const totals = nflRow(2022, "2022 Totals", "17", "2022  Totals");
  const totalsLast = [nflCategory("rushing", [car, sf, totals]), nflCategory("receiving", [car, sf, totals])];
  const totalsFirst = [nflCategory("rushing", [totals, car, sf]), nflCategory("receiving", [totals, car, sf])];
  assert.equal(seasonGamesPlayed(totalsLast, 2022), 17);
  assert.equal(seasonGamesPlayed(totalsFirst, 2022), 17);
});

test("the Totals GP is the largest among the Totals rows, and a Totals row in only one category still wins", () => {
  const car = nflRow(2022, "carolina-panthers", "6");
  const sf = nflRow(2022, "san-francisco-49ers", "11");
  const both = [
    nflCategory("rushing", [car, sf, nflRow(2022, "2022 Totals", "16", "2022  Totals")]),
    nflCategory("receiving", [car, sf, nflRow(2022, "2022 Totals", "17", "2022  Totals")]),
  ];
  assert.equal(seasonGamesPlayed(both, 2022), 17);
  const onlyOne = [nflCategory("rushing", [car, sf]), nflCategory("receiving", [car, sf, nflRow(2022, "2022 Totals", "17", "2022  Totals")])];
  assert.equal(seasonGamesPlayed(onlyOne, 2022), 17);
});

// ESPN's Totals row `GP` is the first team's games only for a traded player (its other columns are
// whole-season), so the Totals row is a floor and the sum over teams is the answer.
test("Shiloh Keo 2016 (id 14122): Totals GP 3 is the first team's, the answer is 3 + 7", () => {
  const defense = nflCategory("defensive", [
    nflRow(2016, "denver-broncos", "3"),
    nflRow(2016, "new-orleans-saints", "7"),
    nflRow(2016, "2016 Totals", "3", "2016  Totals"),
  ]);
  assert.equal(seasonGamesPlayed([defense], 2016), 10);
});

test("a Totals GP above the sum over teams stays", () => {
  const categories = [
    nflCategory("rushing", [nflRow(2022, "team-a", "6"), nflRow(2022, "team-b", "10"), nflRow(2022, "2022 Totals", "17", "2022  Totals")]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2022), 17);
});

test("a Totals GP equal to the sum over teams is that number", () => {
  const car = nflRow(2022, "carolina-panthers", "6");
  const sf = nflRow(2022, "san-francisco-49ers", "11");
  const categories = [nflCategory("rushing", [car, sf, nflRow(2022, "2022 Totals", "17", "2022  Totals")])];
  assert.equal(seasonGamesPlayed(categories, 2022), 17);
});

test("a Totals row in only one category with a smaller GP than the teams' sum gives the sum", () => {
  const categories = [
    nflCategory("rushing", [nflRow(2022, "team-a", "3"), nflRow(2022, "team-b", "7")]),
    nflCategory("receiving", [nflRow(2022, "team-a", "3"), nflRow(2022, "team-b", "7")]),
    nflCategory("defensive", [nflRow(2022, "team-a", "3"), nflRow(2022, "team-b", "7"), nflRow(2022, "2022 Totals", "3", "2022  Totals")]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2022), 10);
});

test("a team in only some categories counts at its largest GP, summed, when the Totals row is smaller", () => {
  const categories = [
    nflCategory("rushing", [nflRow(2022, "team-a", "3"), nflRow(2022, "2022 Totals", "3", "2022  Totals")]),
    nflCategory("receiving", [nflRow(2022, "team-a", "5"), nflRow(2022, "team-b", "4"), nflRow(2022, "2022 Totals", "5", "2022  Totals")]),
    nflCategory("defensive", [nflRow(2022, "team-b", "6")]),
  ];
  // team-a 5 (largest across categories) + team-b 6 = 11, above the Totals GP of 5.
  assert.equal(seasonGamesPlayed(categories, 2022), 11);
});

test("a Totals row with no team rows gives the Totals GP", () => {
  const categories = [nflCategory("rushing", [nflRow(2022, "2022 Totals", "17", "2022  Totals")])];
  assert.equal(seasonGamesPlayed(categories, 2022), 17);
});

test("a traded player with no Totals row gets the sum of the teams' GP", () => {
  // McCaffrey's 2022 rows without the Totals row: CAR 6 + SF 11.
  const mccaffrey = [
    nflCategory("rushing", [nflRow(2022, "carolina-panthers", "6"), nflRow(2022, "san-francisco-49ers", "11")]),
    nflCategory("receiving", [nflRow(2022, "carolina-panthers", "6"), nflRow(2022, "san-francisco-49ers", "11")]),
  ];
  assert.equal(seasonGamesPlayed(mccaffrey, 2022), 17);
  // Robinson 2025 (id 4249342): per-team rows only; a team's GP is its largest across categories, then summed.
  const robinson = [
    nflCategory("rushing", [nflRow(2025, "new-york-giants", "3"), nflRow(2025, "new-york-jets", "1")]),
    nflCategory("receiving", [nflRow(2025, "new-york-giants", "3"), nflRow(2025, "new-york-jets", "1")]),
    nflCategory("defensive", [nflRow(2025, "new-york-giants", "2")]),
  ];
  assert.equal(seasonGamesPlayed(robinson, 2025), 4);
});

test("a team present in only some categories still counts once in the sum", () => {
  const categories = [
    nflCategory("rushing", [nflRow(2025, "team-a", "5")]),
    nflCategory("receiving", [nflRow(2025, "team-a", "7"), nflRow(2025, "team-b", "2")]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2025), 9);
});

test("rows with a display name but no team slug group by that name; rows with neither share one group", () => {
  const named = [{ name: "rushing", labels: ["GP"], statistics: [
    { season: { year: 2025 }, displayName: "Team A", stats: ["4"] },
    { season: { year: 2025 }, displayName: "Team A", stats: ["3"] },
    { season: { year: 2025 }, displayName: "Team B", stats: ["2"] },
  ] }];
  assert.equal(seasonGamesPlayed(named, 2025), 6);
  const bare = [{ labels: ["GP"], statistics: [{ season: { year: 2025 }, stats: ["4"] }, { season: { year: 2025 }, stats: ["3"] }] }];
  assert.equal(seasonGamesPlayed(bare, 2025), 4);
});

test("other seasons' rows, including their Totals rows, are ignored", () => {
  const categories = [
    nflCategory("rushing", [
      nflRow(2021, "2021 Totals", "17", "2021  Totals"),
      nflRow(2021, "carolina-panthers", "17"),
      nflRow(2022, "carolina-panthers", "6"),
      nflRow(2022, "san-francisco-49ers", "11"),
    ]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2022), 17);
  assert.equal(seasonGamesPlayed([nflCategory("rushing", [nflRow(2022, "carolina-panthers", "6"), nflRow(2021, "2021 Totals", "17", "2021  Totals")])], 2022), 6);
});

test("no readable GP for the season is null", () => {
  assert.equal(seasonGamesPlayed([], 2025), null);
  assert.equal(seasonGamesPlayed([{ labels: ["GP"] }, { labels: ["GP"], statistics: [] }], 2025), null);
  // A season the player has no rows for.
  assert.equal(seasonGamesPlayed([nflCategory("rushing", [nflRow(2024, "a", "16")])], 2030), null);
  // A category without a GP label: its rows are not read, even if another column holds a number.
  assert.equal(seasonGamesPlayed([{ labels: ["CAR", "YDS"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["120", "600"] }] }], 2025), null);
  assert.equal(seasonGamesPlayed([{ statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["16"] }] }], 2025), null);
  // GP position past the end of the row, or not a number.
  assert.equal(seasonGamesPlayed([{ labels: ["CAR", "GP"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["120"] }] }], 2025), null);
  assert.equal(seasonGamesPlayed([{ labels: ["GP"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["--"] }, { season: { year: 2025 }, teamSlug: "b", stats: [""] }] }], 2025), null);
});

test("GP is read by its position in the category's labels, not the first column", () => {
  const category = { labels: ["YDS", "GP"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["600", "14"] }] };
  assert.equal(seasonGamesPlayed([category], 2025), 14);
});

test("an unreadable GP in one category does not hide another category's", () => {
  const categories = [
    { labels: ["CAR", "YDS"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["120", "600"] }] },
    nflCategory("receiving", [nflRow(2025, "a", "13")]),
  ];
  assert.equal(seasonGamesPlayed(categories, 2025), 13);
});

test("a comma-formatted GP parses", () => {
  const category = { labels: ["GP"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["1,012"] }] };
  assert.equal(seasonGamesPlayed([category], 2025), 1012);
});

test("a GP of 0 is returned as 0, for the loader to decide", () => {
  assert.equal(seasonGamesPlayed([nflCategory("passing", [nflRow(2025, "a", "0")])], 2025), 0);
});

// The season window is pinned to the games history (2015), not to today's date: every case passes the
// current year, so nothing here depends on when the test runs. Every League has a HISTORY_START entry,
// so the fallback (`currentYear - SEASON_YEARS_BACK`) is reached only through the Math.min, not by a
// league without an entry; only the pinned leagues are tested.
test("NBA, NFL and the pinned soccer leagues start at 2015 in any current year, so 2015 is never dropped", () => {
  for (const league of ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl"] as const) {
    for (const currentYear of [2026, 2027, 2035]) {
      assert.equal(seasonWindowStart(league, currentYear), 2015, `${league} ${currentYear}`);
    }
  }
});

test("the window reaches further back than the pin when the relative window does", () => {
  // Cricket's competitions are pinned earlier than 2015; the window is the earlier of the two.
  assert.equal(seasonWindowStart("ipl", 2026), 2008);
  assert.equal(seasonWindowStart("cwc", 2035), 1975);
  // A pin later than the relative window does not shorten it: WPL is pinned to 2023, the window is 2015 in 2026.
  assert.equal(seasonWindowStart("wpl", 2026), 2026 - SEASON_YEARS_BACK);
});
