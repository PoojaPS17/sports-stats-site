import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { playingXi } from "../src/lib/cricketPlayingXi";
import { parseCricketSeriesStandings } from "../src/lib/cricketSeriesStandings";
import { CricketPlayingXi } from "../src/components/CricketPlayingXi";
import { CricketPointsTable } from "../src/components/CricketPointsTable";
import { CricketMatchInfo } from "../src/components/CricketMatchInfo";
import { HomeCricket } from "../src/components/HomeCricket";
import { SeriesMatchRow } from "../src/components/CricketSeries";

// Search Console, 2026-10-05: cricket match pages sit on page one (position 8-9) for "A vs B scorecard", "players"
// and "points table" queries and get 0.1-0.5% of the clicks. The sections below put those words, and that content,
// on the pages; the source checks make sure the pages actually use them.
const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1553790.json", import.meta.url), "utf8"));
const standings = parseCricketSeriesStandings(JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-standings-1554058.json", import.meta.url), "utf8")))!;
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CricketPlayingXi: a Playing XI heading, one list per side, captain and keeper marked", () => {
  const html = renderToStaticMarkup(createElement(CricketPlayingXi, { sides: playingXi(summary) }));
  assert.match(html, /<h2[^>]*>.*Playing XI/);
  assert.match(html, /<h3[^>]*>[^<]*Khan Research Laboratories/);
  assert.match(html, /<h3[^>]*>[^<]*Hyderabad Kingsmen Academy/);
  assert.match(html, /Iftikhar Ahmed[^<]*<[^>]*>\s*\(c\)/);
  assert.match(html, /Asim Ali[^<]*<[^>]*>\s*\(wk\)/);
  assert.equal((html.match(/<li/g) ?? []).length, 22);
  // Nothing to show renders nothing, not an empty heading.
  assert.equal(renderToStaticMarkup(createElement(CricketPlayingXi, { sides: [] })), "");
});

test("CricketPointsTable: the points table with the feed's columns, NRR and T only when the feed has them", () => {
  const html = renderToStaticMarkup(createElement(CricketPointsTable, { table: standings }));
  assert.match(html, /<h2[^>]*>.*Points table/);
  for (const col of ["Team", "M", "W", "L", "NR", "Pts", "NRR"]) assert.match(html, new RegExp(`<th[^>]*>${col}</th>`), col);
  assert.doesNotMatch(html, /<th[^>]*>T<\/th>/);
  assert.match(html, /Titans Women/);
  assert.match(html, /<td[^>]*>5<\/td>/);
  assert.match(html, /1\.72/);
  const bare = { ...standings, hasNrr: false, hasTies: true, groups: [{ name: "Group A", rows: standings.groups[0].rows.map((r) => ({ ...r, qualified: r.rank === 1 })) }] };
  const html2 = renderToStaticMarkup(createElement(CricketPointsTable, { table: { ...bare, hasQualified: true } }));
  assert.doesNotMatch(html2, /<th[^>]*>NRR<\/th>/);
  assert.match(html2, /<th[^>]*>T<\/th>/);
  assert.match(html2, /<h3[^>]*>Group A/);
  assert.match(html2, /Qualified/);
});

test("CricketMatchInfo: series, stage, format, venue, umpires and the result, as a list", () => {
  const html = renderToStaticMarkup(
    createElement(CricketMatchInfo, {
      series: { name: "President's Trophy 2026-27", href: "/cricket/series/1553000" },
      stage: "14th Match",
      format: "First-class",
      date: "2026-09-30T05:00:00Z",
      venue: "National Ground, Islamabad",
      officials: [
        { name: "Imranullah Aslam", role: "umpire" },
        { name: "Imtiaz Iqbal", role: "umpire" },
        { name: "Aleem Moosa", role: "referee" },
      ],
      playerOfTheMatch: null,
      result: "Match drawn",
    })
  );
  assert.match(html, /<h2[^>]*>.*Match info/);
  assert.match(html, /<dt[^>]*>Series<\/dt>.*President&#x27;s Trophy 2026-27/);
  assert.match(html, /<dt[^>]*>Umpires<\/dt><dd[^>]*>Imranullah Aslam, Imtiaz Iqbal/);
  assert.match(html, /<dt[^>]*>Match referee<\/dt><dd[^>]*>Aleem Moosa/);
  assert.match(html, /<dt[^>]*>Venue<\/dt><dd[^>]*>National Ground, Islamabad/);
  assert.match(html, /<dt[^>]*>Format<\/dt><dd[^>]*>First-class/);
  assert.match(html, /<dt[^>]*>Result<\/dt><dd[^>]*>Match drawn/);
  // Rows with nothing to say are left out.
  assert.doesNotMatch(html, /Player of the Match/);
});

test("HomeCricket: the domestic and women's series in progress are linked from the homepage block", () => {
  const html = renderToStaticMarkup(
    createElement(HomeCricket, {
      live: 0,
      next: [],
      otherSeries: [
        { espn_id: "1554058", name: "CSA Women Pro50 Series 2026/27", live: true },
        { espn_id: "1553000", name: "President's Trophy 2026-27", live: false },
      ],
    })
  );
  assert.match(html, /Also in progress/);
  assert.match(html, /href="\/cricket\/series\/1554058"[^>]*>[^<]*CSA Women Pro50 Series 2026\/27/);
  assert.match(html, /href="\/cricket\/series\/1553000"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(HomeCricket, { live: 0, next: [], otherSeries: [] })), /Also in progress/);
});

test("the cricket match page titles, names and sections come from the helpers", () => {
  const page = read("src/lib/cricketMatchPage.tsx");
  assert.match(page, /cricketMatchTitleCandidates/);
  assert.match(page, /fitTitle\(\.\.\.cricketMatchTitleCandidates\(/);
  assert.match(page, /join\(" vs "\)/);
  assert.doesNotMatch(page, /join\(" v "\)/);
  assert.match(page, /<CricketPlayingXi /);
  assert.match(page, /<CricketMatchInfo[\s>]/);
  assert.match(page, /playingXi\(summary\)/);
});

test("the cricket series page titles and table come from the helpers, and the table is fetched for the title too", () => {
  const page = read("src/app/cricket/series/[id]/page.tsx");
  assert.match(page, /fitTitle\(\.\.\.cricketSeriesTitleCandidates\(/);
  assert.match(page, /cricketSeriesDescription\(/);
  assert.match(page, /<CricketPointsTable /);
  assert.equal((page.match(/fetchCricketSeriesStandings\(/g) ?? []).length, 2);
  assert.match(page, /pointsTableShown\(/);
  // The format label leak: the raw class cards no longer reach the description.
  assert.doesNotMatch(page, /s\.formats\.join\(", "\)/);
});

test("the series hub shows other competitions in progress in the open, with the rest behind the toggle", () => {
  const hub = read("src/app/cricket/series/page.tsx");
  const open = hub.indexOf("<ByKind series={otherInProgress}");
  const details = hub.indexOf("<details");
  assert.ok(open > 0, "otherInProgress rendered");
  assert.ok(open < details, "in-progress list comes before the details toggle");
  assert.match(hub, /otherRest/);
});

test("the homepage reads the other series in progress at the fixtures tier", () => {
  const data = read("src/lib/homeData.ts");
  assert.match(data, /getCricketSeriesInProgressOther\(/);
  assert.match(data, /otherSeries: /);
  assert.match(read("src/app/page.tsx"), /otherSeries=\{home\.otherSeries\}/);
});

test("series cards, rows, the export card and the series header print formats in a reader's words, never the raw class card", () => {
  const match = {
    espn_id: "1553792",
    series_espn_id: "8836-2026-27",
    series_name: "President's Trophy 2026-27",
    series_kind: "domestic" as const,
    date: "2026-09-30T05:00:00Z",
    name: "Oil & Gas Development Company Limited v State Bank of Pakistan",
    short_name: null,
    description: "3rd Match",
    class_card: "Other OD",
    international_class_id: "0",
    status_state: "post" as const,
    status_summary: "OGDCL won by 5 wickets",
    home: { id: "1", name: "Oil & Gas Development Company Limited", abbreviation: "O&G", score: "250/8", winner: true, logo: null },
    away: { id: "2", name: "State Bank of Pakistan", abbreviation: "SBP", score: "246", winner: false, logo: null },
    scorecard_league: null,
  };
  const row = renderToStaticMarkup(createElement(SeriesMatchRow, { m: match }));
  assert.match(row, /3rd Match · One-day/);
  assert.doesNotMatch(row, /Other OD/);
  const seriesPage = read("src/app/cricket/series/[id]/page.tsx");
  assert.match(seriesPage, /seriesFormatTitles\(s\.formats\)/);
  assert.doesNotMatch(seriesPage, /s\.formats\.join/);
  for (const file of ["src/components/CricketSeries.tsx", "src/components/SeriesMatchesExportCard.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /formats\.join\(" · "\)/, `${file} still joins raw class cards`);
    assert.match(src, /seriesFormatTitles\(/, `${file} uses the labels`);
  }
  assert.doesNotMatch(read("src/components/CricketSeries.tsx"), /m\.class_card\]/, "the match row no longer prints the raw card");
});
