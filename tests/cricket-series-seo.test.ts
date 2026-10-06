import { test } from "node:test";
import assert from "node:assert/strict";
import { cricketFormatTitle, cricketSeriesDescription, cricketSeriesTitleCandidates, seriesFormatLabels, seriesFormatTitles } from "../src/lib/cricketSeriesSeo";
import { fitTitle } from "../src/lib/metadata";

// The series row's `formats` are ESPN's class cards as stored ("Other OD", "Other T20", "Women T20", "List A",
// "First-class", "Twenty20", "Test", "ODI", "T20I", "Youth ODI", "Other match"), which leaked into search snippets
// as "(Other OD)". A reader's words instead, and nothing for the catch-all card.
test("seriesFormatLabels: ESPN's class cards in a reader's words, without repeats or the catch-all", () => {
  assert.deepEqual(seriesFormatLabels(["Other OD"]), ["one-day"]);
  assert.deepEqual(seriesFormatLabels(["Other T20", "Twenty20"]), ["T20"]);
  assert.deepEqual(seriesFormatLabels(["Women T20", "Women's ODI"]), ["women's T20", "women's ODI"]);
  assert.deepEqual(seriesFormatLabels(["First-class", "List A"]), ["first-class", "List A"]);
  assert.deepEqual(seriesFormatLabels(["Test", "ODI", "T20I"]), ["Test", "ODI", "T20I"]);
  assert.deepEqual(seriesFormatLabels(["Youth ODI", "Other match"]), ["youth ODI"]);
  assert.deepEqual(seriesFormatLabels([]), []);
});

const csa = { name: "CSA Women Pro50 Series 2026/27", formats: ["Other OD"], teams: Array.from({ length: 8 }, (_, i) => ({ name: `Team ${i + 1}` })) };
const tri = { name: "Pakistan Women's Under-19s T20 Tri-Series 2026/27", formats: ["Youth T20"], teams: [{ name: "Bangladesh Women Under-19s" }, { name: "Pakistan Women Under-19s" }, { name: "Nepal Women Under-19s" }] };

test("cricketSeriesTitleCandidates: the words searchers use, with the points table named only when the page shows one", () => {
  assert.deepEqual(cricketSeriesTitleCandidates(csa, true), ["CSA Women Pro50 Series 2026/27 Fixtures, Results & Points Table", "CSA Women Pro50 Series 2026/27 Points Table & Results", "CSA Women Pro50 Series 2026/27 Fixtures & Results", "CSA Women Pro50 Series 2026/27"]);
  assert.deepEqual(cricketSeriesTitleCandidates(csa, false), ["CSA Women Pro50 Series 2026/27 Fixtures & Results", "CSA Women Pro50 Series 2026/27"]);
  // The long tri-series name only fits on its own.
  assert.equal(fitTitle(...cricketSeriesTitleCandidates(tri, true)), "Pakistan Women's Under-19s T20 Tri-Series 2026/27");
  // "points table" is the query (Search Console), so the form that keeps it comes before the one that drops it.
  assert.equal(fitTitle(...cricketSeriesTitleCandidates(csa, true)), "CSA Women Pro50 Series 2026/27 Points Table & Results");
});

test("cricketSeriesDescription: what the page holds, the format in words, the teams when there are few", () => {
  assert.equal(cricketSeriesDescription(csa, true), "CSA Women Pro50 Series 2026/27: fixtures, results, points table and live scores for every one-day match, with the scorecard of each.");
  assert.equal(cricketSeriesDescription(csa, false), "CSA Women Pro50 Series 2026/27: fixtures, results and live scores for every one-day match, with the scorecard of each.");
  // The team list is dropped when it would push the description past what a search result shows (160 characters),
  // since a list cut mid-name says less than no list.
  assert.equal(cricketSeriesDescription(tri, true), "Pakistan Women's Under-19s T20 Tri-Series 2026/27: fixtures, results, points table and live scores for every youth T20 match, with the scorecard of each.");
  assert.equal(
    cricketSeriesDescription({ name: "U19 Tri-Series 2026/27", formats: ["Youth T20"], teams: [{ name: "Bangladesh U19" }, { name: "Pakistan U19" }, { name: "Nepal U19" }] }, true),
    "U19 Tri-Series 2026/27: fixtures, results, points table and live scores for every youth T20 match between Bangladesh U19, Pakistan U19 and Nepal U19."
  );
  assert.equal(cricketSeriesDescription({ name: "India tour of Australia 2026-27", formats: ["Test", "T20I"], teams: [{ name: "India" }, { name: "Australia" }] }, false), "India tour of Australia 2026-27: fixtures, results and live scores for every Test and T20I match between India and Australia.");
  assert.equal(cricketSeriesDescription({ name: "Odd Cup", formats: ["Other match"], teams: [] }, false), "Odd Cup: fixtures, results and live scores for every match, with the scorecard of each.");
});

test("cricketSeriesDescription: with leaders, the format tail makes room for them, so the snippet names the players", () => {
  const leaders = "Most runs: Faye Tunnicliffe (171); most wickets: Paulinah Mashishi (4).";
  assert.equal(cricketSeriesDescription(csa, true, leaders), `CSA Women Pro50 Series 2026/27: points table, results and live scores. ${leaders}`);
  assert.equal(cricketSeriesDescription(csa, false, leaders), `CSA Women Pro50 Series 2026/27: fixtures, results and live scores. ${leaders}`);
  // No leaders yet: the usual description.
  assert.equal(cricketSeriesDescription(csa, true, null), cricketSeriesDescription(csa, true));
});

test("a class card becomes a label a reader understands, capitalised for a card or row", () => {
  assert.equal(cricketFormatTitle("Other OD"), "One-day");
  assert.equal(cricketFormatTitle("Other T20"), "T20");
  assert.equal(cricketFormatTitle("First-class"), "First-class");
  assert.equal(cricketFormatTitle("Women T20"), "Women's T20");
  assert.equal(cricketFormatTitle("Youth ODI"), "Youth ODI");
  assert.equal(cricketFormatTitle("List A"), "List A");
  assert.equal(cricketFormatTitle("T20I"), "T20I");
  assert.equal(cricketFormatTitle("Other match"), null, "a card that says nothing is left out");
  assert.equal(cricketFormatTitle(null), null);
  assert.deepEqual(seriesFormatTitles(["Other OD", "Other T20", "Twenty20", "Other match"]), ["One-day", "T20"]);
  assert.deepEqual(seriesFormatTitles(["First-class", "List A"]), ["First-class", "List A"]);
});
