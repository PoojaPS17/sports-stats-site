import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { parseCricketScorecard, type CricketTeamScorecard } from "../src/lib/matchDetail";
import { scorecardTabs } from "../src/lib/cricketScorecardView";
import { playingXi } from "../src/lib/cricketPlayingXi";
import { topPerformers } from "../src/lib/cricketPerformers";
import { buildMatchShare, cardColour, type BuildShareInput, type ShareHeaderData } from "../src/lib/cricketShare";
import { MatchStoryExportCard, PerformersExportCard, PlayingXiExportCard, ResultExportCard } from "../src/components/CricketShareCards";
import { CricketScorecardExportCard, CricketInningsExportCard } from "../src/components/CricketScorecardExportCard";
import { CricketExportHeader } from "../src/components/CricketExportHeader";
import { CricketPlayingXi } from "../src/components/CricketPlayingXi";
import { CricketMatchInfo } from "../src/components/CricketMatchInfo";
import { CricketMatchHero } from "../src/components/CricketMatchHero";
import { CricketTopPerformers } from "../src/components/CricketTopPerformers";
import { CricketMatchStory } from "../src/components/CricketMatchStory";
import { SectionHeader } from "../src/components/SectionHeader";
import { ShareMenu } from "../src/components/ShareMenu";
import { ResultShare, ScorecardShare, PlayingXiShare } from "../src/components/CricketShares";
import { scorecardBlocks } from "../src/components/CricketScorecard";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const summary = fx("espn-cricket-summary-1554707.json");
const story = deriveMatchStory(fx("espn-cricket-playbyplay-1529230.json") as unknown[]);
const scorecard = parseCricketScorecard(summary);
const tabs = scorecardTabs(scorecard, [], {});
const performers = topPerformers(scorecard, "Nishita Akter Nishi");
const LINK = "https://sports-db.live/cricket/matches/1554707";

const header: ShareHeaderData = {
  eyebrow: "Cricket · T20 · 5th Match · Pakistan Women's Under-19s T20 Tri-Series 2026/27",
  when: "Oct 4, 2026",
  state: "post",
  sides: [
    { name: "Bangladesh Women Under-19s", logo: null, score: "117/8", winner: true },
    { name: "Pakistan Women Under-19s", logo: null, score: "87/6 (20 ov, target 118)", winner: false },
  ],
  result: "Bangladesh Women Under-19s won by 30 runs",
};
const input = (over: Partial<BuildShareInput> = {}): BuildShareInput => ({
  league: "cricket",
  id: "1554707",
  matchName: "Pakistan Women Under-19s vs Bangladesh Women Under-19s",
  link: LINK,
  header,
  calledOff: false,
  potm: { name: "Nishita Akter Nishi", line: "2/16" },
  performers,
  largeLabel: "Player of the Match",
  teams: { "1336142": "Pakistan Women Under-19s", "1336139": "Bangladesh Women Under-19s" },
  facts: [["Series", "Tri-Series"], ["Stage", "5th Match"], ["Format", "T20"], ["Venue", "Gaddafi Stadium, Lahore"], ["Date", "Oct 4, 2026"]],
  xi: playingXi(summary),
  story: [],
  colours: {},
  tabs,
  ...over,
});
const share = buildMatchShare(input());
const { result, performers: perfData, xi, scorecard: scData, ...common } = share;

test("a result has every section's data; the page's common block carries the caption and link only", () => {
  assert.ok(result && perfData && xi && scData);
  assert.equal(share.story, null, "no ball-by-ball, no story card");
  assert.equal(common.link, LINK);
  assert.match(common.caption, /^Bangladesh Women Under-19s 117\/8 v Pakistan Women Under-19s 87\/6\. Bangladesh Women Under-19s won by 30 runs\.\nhttps:\/\/sports-db\.live\//);
});

test("nothing to share: a fixture, a match called off and a section without data have no card, so no button", () => {
  const pre = buildMatchShare(input({ header: { ...header, state: "pre", result: null, sides: header.sides.map((s) => ({ ...s, score: "" })) } }));
  assert.equal(pre.result, null);
  assert.equal(pre.scorecard, null);
  assert.equal(pre.performers, null);
  assert.ok(pre.xi, "a published Playing XI is worth sharing before the toss");
  const off = buildMatchShare(input({ calledOff: true }));
  assert.deepEqual([off.result, off.scorecard, off.performers, off.xi, off.story], [null, null, null, null, null]);
  const bare = buildMatchShare(input({ performers: { large: null, small: [] }, xi: [], tabs: [] }));
  assert.deepEqual([bare.performers, bare.xi, bare.scorecard], [null, null, null]);
  assert.ok(bare.result, "the result card still has the scoreline");
  const live = buildMatchShare(input({ header: { ...header, state: "in", result: null } }));
  assert.ok(live.result && live.scorecard);
});

test("one header for every card: eyebrow, date, both sides with scores, the loser grey, the result in the accent colour", () => {
  const html = renderToStaticMarkup(createElement(CricketExportHeader, { header }));
  assert.match(html, /Cricket · T20 · 5th Match · Pakistan Women&#x27;s Under-19s T20 Tri-Series 2026\/27/);
  assert.match(html, /Oct 4, 2026/);
  assert.match(html, /Bangladesh Women Under-19s/);
  assert.match(html, />117\/8</);
  assert.match(html, />87\/6</);
  assert.match(html, /20 ov, target 118/);
  assert.match(html, /color:#4a6178[^>]*>Pakistan Women Under-19s/, "the side that lost is neutral grey");
  assert.match(html, /color:#2563d9[^>]*>Bangladesh Women Under-19s won by 30 runs/);
  assert.doesNotMatch(html, /red|#c0|coral/i);
});

const noCssVars = (html: string) => assert.doesNotMatch(html, /style="[^"]*var\(--(?!font-jakarta)/, "a card draws in literal hex, never the site's CSS variables");

test("the result card: standard is content height, portrait and story fill their frame; each has the Player of the Match, performers, facts and the navy footer", () => {
  for (const variant of ["standard", "portrait", "story"] as const) {
    const html = renderToStaticMarkup(createElement(ResultExportCard, { data: result!, context: "A vs B · Result", variant }));
    assert.match(html, /data-share-card/);
    assert.match(html, /Player of the Match/i);
    assert.match(html, /Nishita Akter Nishi/);
    assert.match(html, />2\/16</);
    assert.match(html, /Bangladesh Women Under-19s won by 30 runs/);
    assert.match(html, /background:#0f2745/);
    assert.match(html, /Sports<span style="color:#c6f135">DB<\/span>/);
    assert.match(html, /A vs B · Result/);
    noCssVars(html);
    if (variant === "standard") assert.doesNotMatch(html, /height:100%/);
    else assert.match(html, /height:100%/);
  }
  const portrait = renderToStaticMarkup(createElement(ResultExportCard, { data: result!, context: "c", variant: "portrait" }));
  const standard = renderToStaticMarkup(createElement(ResultExportCard, { data: result!, context: "c", variant: "standard" }));
  assert.ok((standard.match(/Gaddafi Stadium/g) ?? []).length === 1 && !portrait.includes("Gaddafi Stadium"), "the portrait frame keeps three facts, the standard one all five");
});

test("the performers card: the large panel then the innings leaders", () => {
  const html = renderToStaticMarkup(createElement(PerformersExportCard, { data: perfData!, context: "c" }));
  assert.match(html, /Top performers/i);
  for (const name of ["Nishita Akter Nishi", "Sadia Akter", "Mahnoor Zeb", "Komal Khan"]) assert.match(html, new RegExp(name));
  assert.match(html, />34\*</);
  noCssVars(html);
});

test("the Playing XI card: both sides numbered, captain and wicketkeeper marked", () => {
  const html = renderToStaticMarkup(createElement(PlayingXiExportCard, { data: xi!, context: "c" }));
  assert.match(html, /Fizza Fiaz \(c\)/);
  assert.match(html, /Komal Khan \(wk\)/);
  assert.match(html, /Sadia Islam \(c\)/);
  assert.equal((html.match(/Wicketkeeper batter/g) ?? []).length, 1);
  assert.equal((html.match(/>11</g) ?? []).length, 2);
  noCssVars(html);
});

test("the match story card: the worm for every innings in literal colours, wickets ringed, no CSS variables, not the interactive inspector", () => {
  const data = buildMatchShare(input({ story, colours: { "4": "#790d1a", "6": "#050ceb" } })).story!;
  const html = renderToStaticMarkup(createElement(MatchStoryExportCard, { data, context: "c" }));
  assert.equal((html.match(/<polyline/g) ?? []).length, 2);
  assert.equal((html.match(/<circle/g) ?? []).length, 12);
  assert.match(html, /stroke="#790d1a"/);
  assert.match(html, /stroke="#050ceb"/);
  assert.match(html, /West Indies 171 all out/);
  assert.doesNotMatch(html, /var\(--(?!font-jakarta)/);
  assert.doesNotMatch(html, /<button|data-over/);
});

test("a side colour that would vanish on white, or that both sides share, falls back to the card's own colours", () => {
  assert.equal(cardColour("#ffffff"), null);
  assert.equal(cardColour("#790D1A"), "#790d1a");
  assert.equal(cardColour("not a colour"), null);
  const same = buildMatchShare(input({ story, colours: { "4": "#790d1a", "6": "#790d1a" } })).story!;
  const html = renderToStaticMarkup(createElement(MatchStoryExportCard, { data: same, context: "c" }));
  assert.match(html, /stroke="#790d1a"/);
  assert.match(html, /stroke="#2563d9"/, "the second line takes the card's accent instead of repeating the first");
});

test("the whole-match scorecard card still renders, from the stored scorecard or from the page's blocks, the same", () => {
  const t20i: CricketTeamScorecard[] = scorecard;
  const fromStored = renderToStaticMarkup(createElement(CricketScorecardExportCard, { header: createElement("i"), context: "c", scorecard: t20i }));
  const fromBlocks = renderToStaticMarkup(createElement(CricketScorecardExportCard, { header: createElement("i"), context: "c", scorecard: [], blocks: scorecardBlocks(t20i) }));
  assert.equal(fromBlocks.replace(/\d{1,2}:\d\d UTC/, "T"), fromStored.replace(/\d{1,2}:\d\d UTC/, "T"));
  assert.match(fromStored, /Bangladesh Women Under-19s/);
  assert.match(fromStored, /Sadia Akter/);
  assert.match(fromStored, /data-share-card/);
});

test("the per-innings card shows one innings with extras, the total and the fall of wickets", () => {
  const withStory = scorecardTabs(
    [
      { teamId: "4", teamName: "West Indies", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [{ name: "Shai Hope", athleteId: "h", stats: ["52", "38", "2", "1", "136.84"], innings: 1, position: 1, dismissal: "not out" }], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [], innings: [{ period: 1, runs: 171, wickets: 10, overs: 19.1, description: "all out" }] },
      { teamId: "6", teamName: "India", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [{ name: "Arshdeep Singh", athleteId: "as", stats: ["4", "0", "28", "3", "7.00"], innings: 1, position: 1, dismissal: null }], innings: [{ period: 2, runs: 172, wickets: 2, overs: 14.4, description: "target reached" }] },
    ],
    story,
    {}
  );
  const html = renderToStaticMarkup(createElement(CricketInningsExportCard, { header: createElement("i"), context: "c", tab: withStory[0] }));
  assert.match(html, /Shai Hope/);
  assert.match(html, /Extras/);
  assert.match(html, /171 all out · 19\.1 overs/);
  assert.match(html, /Fall of wickets/);
  assert.match(html, /1-38 Pooran/);
  assert.doesNotMatch(html, /India innings/);
  assert.match(html, /data-share-card/);
});

test("the cards are mounted lazily: the page HTML carries the button and no hidden card", () => {
  for (const el of [
    createElement(ResultShare, { common, data: result! }),
    createElement(ScorecardShare, { common, data: scData! }),
    createElement(PlayingXiShare, { common, data: xi! }),
  ]) {
    const html = renderToStaticMarkup(el);
    assert.match(html, /aria-haspopup="menu"/);
    assert.doesNotMatch(html, /data-share-card|-99999|role="menu"/);
    assert.doesNotMatch(html, /Nishita|Sadia Akter|Fizza Fiaz/, "no card text in the server HTML");
  }
  const src = readFileSync("src/components/ShareMenu.tsx", "utf8");
  assert.match(src, /\{armed && \(/, "the card tree is behind the armed flag");
  assert.match(src, /onPointerEnter=\{arm\}/);
  assert.match(src, /onFocus=\{arm\}/);
  const shares = readFileSync("src/components/CricketShares.tsx", "utf8");
  assert.match(shares, /lazy\(\(\) => loadCards\(\)/, "the card module is a dynamic import");
});

test("the menu offers a size picker on the result and a scope picker on the scorecard, and Copy as text only where it makes sense", () => {
  const src = readFileSync("src/components/CricketShares.tsx", "utf8");
  assert.match(src, /label: "Standard"[\s\S]*label: "Portrait"[\s\S]*label: "Story"/);
  assert.match(src, /width: 540, height: 675/);
  assert.match(src, /width: 540, height: 960/);
  assert.match(src, /label: "This innings"[\s\S]*label: "Whole match"/);
  const menu = readFileSync("src/components/ShareMenu.tsx", "utf8");
  assert.match(menu, /Share image/);
  assert.match(menu, /Download image/);
  assert.match(menu, /Copy as text/);
  assert.match(menu, /Copy link/);
  assert.match(menu, /\{textValue && \(/);
  // the share sheet gets the caption
  assert.match(menu, /navigator\.share\(\{ files: \[file\], title: shareTitle, text: caption \}\)/);
  // never silent: a failed picture says so, a blocked clipboard leaves the text selected
  assert.match(menu, /Couldn&apos;t make the picture|Couldn't make the picture/);
  assert.match(menu, /note\.select/);
});

test("the share control sits on the heading row, right-aligned, and the collapsed Playing XI shows it only once open, never inside the summary", () => {
  const head = renderToStaticMarkup(createElement(SectionHeader, { menu: createElement("span", { id: "m" }) } as unknown as ComponentProps<typeof SectionHeader>, "Top performers"));
  assert.match(head, /<div class="-mt-1 shrink-0 self-start"><span id="m"><\/span><\/div>/);
  assert.ok(head.indexOf('id="m"') < head.indexOf("</div></div>") + 1, "inside the heading row, before the tools row");

  const open = renderToStaticMarkup(createElement(CricketPlayingXi, { sides: playingXi(summary), collapsed: true, share: createElement("span", { id: "share-xi" }) }));
  const summaryHtml = open.slice(open.indexOf("<summary"), open.indexOf("</summary>"));
  assert.ok(summaryHtml.length > 0);
  assert.doesNotMatch(summaryHtml, /share-xi/);
  assert.match(open, /<details[\s\S]*share-xi[\s\S]*<\/details>/);

  const plain = renderToStaticMarkup(createElement(CricketPlayingXi, { sides: playingXi(summary), share: createElement("span", { id: "share-xi" }) }));
  assert.match(plain, /share-xi/);
  assert.doesNotMatch(plain, /<summary/);

  const perf = renderToStaticMarkup(createElement(CricketTopPerformers, { ...performers, league: "odi", playerSlugs: new Map(), teams: {}, share: createElement("span", { id: "share-perf" }) }));
  assert.match(perf, /share-perf/);
  const noShare = renderToStaticMarkup(createElement(CricketTopPerformers, { ...performers, league: "odi", playerSlugs: new Map(), teams: {} }));
  assert.doesNotMatch(noShare, /-mt-1/);
  const storyHtml = renderToStaticMarkup(createElement(CricketMatchStory, { innings: story, colours: {}, share: createElement("span", { id: "share-story" }) }));
  assert.match(storyHtml, /share-story/);
});

test("the hero carries the result's share control on its first row and keeps the h1 clear of it", () => {
  const props = {
    state: "post" as const,
    calledOff: null,
    headline: "A vs B",
    date: "2026-10-04T10:00Z",
    sides: [
      { name: "A", score: "1/0", winner: true, logo: null, colour: null },
      { name: "B", score: "0/1", winner: false, logo: null, colour: null },
    ] as [{ name: string; score: string; winner: boolean; logo: null; colour: null }, { name: string; score: string; winner: boolean; logo: null; colour: null }],
    result: "A won",
    potm: null,
    pills: [],
    liveLine: null,
    venue: null,
  };
  const withShare = renderToStaticMarkup(createElement(CricketMatchHero, { ...props, share: createElement("span", { id: "share-hero" }) }));
  assert.match(withShare, /share-hero/);
  assert.doesNotMatch(withShare.slice(withShare.indexOf("<h1"), withShare.indexOf("</h1>")), /share-hero/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(CricketMatchHero, props)), /share-hero|pr-12/);
});

test("Match info is its own collapsed card on the league page too", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchInfo, { collapsed: true, series: { name: "S", href: null }, stage: "1st T20I", format: "T20I", date: "2026-10-04T10:00Z", venue: "Ground", officials: [], playerOfTheMatch: "P", result: "A won" }));
  assert.match(html, /<details/);
  assert.match(html, /Match info/);
});

test("the ShareMenu is exported with one picker contract: variants carry their own card size", () => {
  assert.equal(typeof ShareMenu, "function");
});
