import { before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { summarizePlayoffs } from "../src/lib/seasonSummary";
import { SeasonSummary } from "../src/components/SeasonSummary";
import type { GameRow } from "../src/lib/queries";

// parseRound imports the database module, which only reads DATABASE_URL: nothing here connects.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";
let parseRound: typeof import("../scripts/lib/games").parseRound;
let parseCricketRound: typeof import("../scripts/lib/games").parseCricketRound;
before(async () => {
  ({ parseRound, parseCricketRound } = await import("../scripts/lib/games"));
});

// Real ESPN `description` strings (scoreboard?season=<year> of each competition) and what parseRound made of each
// before this change (null when it made nothing). A round the old code produced must come out exactly the same.
const UNCHANGED: [string, string][] = [
  ["Qualifier 1 (N), Indian Premier League at Chennai, May 23 2023", "Qualifier 1"],
  ["Eliminator (N), Pepsi Indian Premier League at Pune, May 20 2015", "Eliminator"],
  ["Final (N), Big Bash League at Hobart, Jan 27 2025", "Final"],
  ["Final (D/N), ICC Cricket World Cup at Mumbai, Apr 2 2011", "Final"],
  ["Challenger (N), Big Bash League at Sydney, Jan 24 2025", "Challenger"],
  ["Knockout (N), Big Bash League at Sydney, Jan 22 2025", "Knockout"],
  ["69th Match (D/N), Indian Premier League at Mumbai, May 21 2023", "Match 69"],
  ["1st Match (N), Indian Premier League at Ahmedabad, Mar 31 2023", "Match 1"],
  ["22nd match (N), Pepsi Indian Premier League at Ahmedabad, Apr 24 2015", "Match 22"],
  ["23rd Match (D/N), Women's Big Bash League at Adelaide, Nov 11 2024", "Match 23"],
  ["1st Semi-Final (N), ICC Men's T20 World Cup at Sydney, Nov 9 2022", "1st Semi-Final"],
  ["1st Semi Final (D/N), ICC Women's World Cup at Guwahati, Oct 29 2025", "1st Semi Final"],
  ["2nd Quarter-Final (D/N), ICC Cricket World Cup at Ahmedabad, Mar 24 2011", "2nd Quarter-Final"],
  ["22nd Match, Group B (D/N), ICC Cricket World Cup at Bengaluru, Mar 6 2011", "22nd Match, Group B"],
  ["2nd Match, First Round Group A (N), ICC Men's T20 World Cup at Geelong, Oct 16 2022", "2nd Match, First Round Group A"],
  ["42nd Match, Super Eights, Group 2 (N), ICC Men's T20 World Cup at Gros Islet, Jun 19 2024", "42nd Match, Super Eights, Group 2"],
  ["21st Match, Super Six (D/N), ICC Women's World Cup at Mumbai, Feb 13 2013", "21st Match, Super Six"],
  ["7th place play-off (D/N), Women's World T20 at Sylhet, Apr 3 2014", "7th place play-off"],
];
// The same feeds' daytime matches: no "(D/N)" or "(N)", so the old code returned null and the match had no round.
const NOW_HAS_ROUND: [string, string][] = [
  ["Final, Women's Big Bash League at Hobart, Dec 13 2025", "Final"],
  ["Final, ICC Cricket World Cup at London, Jul 14 2019", "Final"],
  ["Final, ICC World Twenty20 at Bridgetown, May 16 2010", "Final"],
  ["1st Semi-final, ICC Cricket World Cup at Manchester, Jul 9-10 2019", "1st Semi-Final"],
  ["2nd Semi-final, ICC Cricket World Cup at Birmingham, Jul 11 2019", "2nd Semi-Final"],
  ["2nd Semi-Final, ICC World Twenty20 at Gros Islet, May 14 2010", "2nd Semi-Final"],
  ["Challenger, Women's Big Bash League at Brisbane, Nov 29 2024", "Challenger"],
  ["Knockout, Women's Big Bash League at Sydney, Nov 27 2024", "Knockout"],
  ["3rd Place Play-off, ICC Women's World Cup at Mumbai, Feb 15 2013", "3rd Place Play-off"],
  ["1st match, ICC Cricket World Cup at London, May 30 2019", "Match 1"],
  ["3rd match, ICC Cricket World Cup at Cardiff, Jun 1 2019", "Match 3"],
  ["2nd Match, Group A, ICC Cricket World Cup at Chennai, Feb 20 2011", "2nd Match, Group A"],
  ["2nd Match, Group C, ICC Men's T20 World Cup at Providence, Jun 2 2024", "2nd Match, Group C"],
  ["43rd Match, Super Eights, Group 1, ICC Men's T20 World Cup at Bridgetown, Jun 20 2024", "43rd Match, Super Eights, Group 1"],
  ["13th Match, Super Six, ICC Women's World Cup at Mumbai, Feb 8 2013", "13th Match, Super Six"],
];

test("every round the old parser produced comes out exactly the same", () => {
  for (const [description, round] of UNCHANGED) assert.equal(parseRound("ipl", { description }), round, description);
});

test("a daytime final, semi-final or knockout with no (D/N) marker now has its round", () => {
  for (const [description, round] of NOW_HAS_ROUND) assert.equal(parseRound("wbbl", { description }), round, description);
});

test("a description that is only '<series> at <venue>' has no stage, and one with no description falls to the non-cricket rule", () => {
  assert.equal(parseCricketRound("Indian Premier League at Chennai, Mar 22 2026"), null);
  assert.equal(parseCricketRound("Indian Premier League"), null);
  assert.equal(parseCricketRound(""), null);
  assert.equal(parseRound("ipl", {}), null);
});

test("a description with no 'at <venue>' segment whose first segment names the competition has no stage", () => {
  for (const description of ["Women's Big Bash League, Dec 13 2025", "Indian Premier League, Mar 22 2026", "ICC Cricket World Cup, Jun 1 2019", "Tri-Nation Trophy, Jan 3 2020", "Super Smash Series, Jan 3 2020"]) assert.equal(parseCricketRound(description), null, description);
  // ...while a stage in the same shape still reads as one.
  assert.equal(parseCricketRound("Final, Dec 13 2025"), "Final");
  assert.equal(parseCricketRound("2nd match, Dec 13 2025"), "Match 2");
});

/* ---- the Playoffs block ---- */

let n = 0;
function game(round: string | null, over: Partial<GameRow> = {}): GameRow {
  n += 1;
  return {
    league: "t20wc", espn_id: String(n), date: `2024-06-${String(1 + (n % 28)).padStart(2, "0")}T14:00:00Z`, name: "A v B", short_name: null, home_score: 120, away_score: 110, home_score_display: "120/5", away_score_display: "110/8",
    home_winner: true, away_winner: false, season_year: 2024, status_state: "post", status_detail: "Final", status_summary: "India won by 10 runs", round, stage: "other", completed: true,
    home_team_espn_id: `h${n}`, away_team_espn_id: `a${n}`, home_name: `Home ${n}`, home_slug: `home-${n}`, home_abbr: null, home_logo: null, home_color: null,
    away_name: `Away ${n}`, away_slug: `away-${n}`, away_abbr: null, away_logo: null, away_color: null, ...over,
  };
}

test("group matches are not playoffs: 'Match 3', '2nd Match, Group C' and 'Nth Match, Super Eights' are left out", () => {
  const games = [
    game("Match 3"),
    game("2nd Match, Group C"),
    game("22nd Match, Group B"),
    game("41st Match, Super Eights, Group 2"),
    game("13th Match, Super Six"),
    game("1st Semi-Final"),
    game("2nd Semi-Final"),
    game("Final"),
  ];
  assert.deepEqual(summarizePlayoffs(games).map((r) => r.round), ["1st Semi-Final", "2nd Semi-Final", "Final"]);
});

test("a knockout stage with a number in it is still a playoff round (3rd Place Play-off, 1st Quarter-Final)", () => {
  assert.deepEqual(summarizePlayoffs([game("3rd Place Play-off"), game("1st Quarter-Final")]).map((r) => r.round), ["3rd Place Play-off", "1st Quarter-Final"]);
});

test("an abandoned knockout match reads 'No result' and never names a winner", () => {
  const abandoned = game("Final", { home_winner: null, away_winner: null, home_score: 35, away_score: null, home_score_display: "35/1 (4 ov)", away_score_display: null, status_summary: "Match abandoned without a ball bowled" });
  const [r] = summarizePlayoffs([abandoned]);
  assert.equal(r.noWinner, true);
  assert.equal(r.resultText, "No result");
  const markup = renderToStaticMarkup(createElement(SeasonSummary, { league: "t20wc", playoffResults: [r], standings: [] }));
  assert.match(markup, /No result/);
  assert.doesNotMatch(markup, /beat/);
  assert.match(markup, /Home \d+<\/a> v <a[^>]*>Away \d+<\/a>/);
});

test("a tied knockout the feed names no winner for reads 'Match tied', never 'No result'; two abandoned games in one round never read 'won the series 0-0'", () => {
  const tied = game("Final", { home_winner: null, away_winner: null, home_score: 150, away_score: 150, status_summary: "Match tied" });
  const [t] = summarizePlayoffs([tied]);
  assert.deepEqual([t.noWinner, t.resultText], [true, "Match tied"]);
  const markup = renderToStaticMarkup(createElement(SeasonSummary, { league: "t20wc", playoffResults: [t], standings: [] }));
  assert.match(markup, /Match tied/);
  assert.doesNotMatch(markup, /No result|beat/);
  const pair = { home_team_espn_id: "h", away_team_espn_id: "a", home_name: "Home", away_name: "Away", home_slug: "home", away_slug: "away", home_winner: null, away_winner: null, home_score: 35, away_score: null, status_summary: "Match abandoned without a ball bowled" };
  const twice = summarizePlayoffs([game("Final", { ...pair }), game("Final", { ...pair })]);
  assert.equal(twice.length, 1);
  assert.deepEqual([twice[0].noWinner, twice[0].resultText], [true, "No result"]);
  const played = renderToStaticMarkup(createElement(SeasonSummary, { league: "t20wc", playoffResults: twice, standings: [] }));
  assert.doesNotMatch(played, /series|beat|0-0/);
});

test("the Playoffs block spells every round one way, whatever spelling the feed used", () => {
  const results = summarizePlayoffs([game("1st Semi-final"), game("2nd Semi Final"), game("Final"), game("3rd place play-off")]);
  const markup = renderToStaticMarkup(createElement(SeasonSummary, { league: "t20wc", playoffResults: results, standings: [] }));
  const rounds = [...markup.matchAll(/uppercase[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(rounds, ["1st Semi-Final", "2nd Semi-Final", "Final", "3rd Place Play-off"]);
  assert.deepEqual(results.map((r) => r.round), ["1st Semi-final", "2nd Semi Final", "Final", "3rd place play-off"], "stored rounds are not rewritten");
});

test("a decided knockout match still reads 'X beat Y' with its summary, and the feed's winner is trusted over the scores", () => {
  const dls = game("2nd Semi-Final", { home_winner: false, away_winner: true, home_score: 150, away_score: 90, status_summary: "Away won by 5 runs (DLS method)" });
  const [r] = summarizePlayoffs([dls]);
  assert.equal(r.noWinner, undefined);
  assert.equal(r.winnerName, dls.away_name);
  assert.equal(r.resultText, "Away won by 5 runs (DLS method)");
  const markup = renderToStaticMarkup(createElement(SeasonSummary, { league: "t20wc", playoffResults: [r], standings: [] }));
  assert.match(markup, / beat /);
});

test("a cricket row stored without winner flags but with a 'won' summary is still a decided match", () => {
  const [r] = summarizePlayoffs([game("Final", { home_winner: null, away_winner: null, status_summary: "Home won by 10 runs" })]);
  assert.equal(r.noWinner, undefined);
  assert.equal(r.winnerName, "Home " + n);
});

test("non-cricket series (NBA) are summarized as before, including a level score with no flags", () => {
  const nba = (i: number) => game("East 1st Round - Game " + i, { league: "nba", home_team_espn_id: "1", away_team_espn_id: "2", home_name: "Celtics", away_name: "Heat", home_slug: "celtics", away_slug: "heat", home_winner: true, away_winner: false, status_summary: null, home_score_display: null, away_score_display: null });
  const [r] = summarizePlayoffs([nba(1), nba(2), nba(3), nba(4)]);
  assert.equal(r.round, "East 1st Round");
  assert.equal(r.resultText, "won the series 4-0");
  assert.equal(r.noWinner, undefined);
});
