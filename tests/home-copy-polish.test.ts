// Small copy and markup fixes on the homepage, league scores page and footer, pinned to the source they describe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

test("the day header's Full day link gets its arrow from SectionHeader, not from its own label", () => {
  const page = read("src/app/[league]/page.tsx");
  assert.match(page, /action=\{\{ label: "Full day", href:/);
  assert.doesNotMatch(page, /label: "[^"]*→"/);
  assert.match(read("src/components/SectionHeader.tsx"), /\{action\.label\} →/);
});

test("the homepage Coming up list names each fixture's competition; the Live list is unchanged", () => {
  const src = read("src/components/HomeLive.tsx");
  const coming = src.slice(src.indexOf("export function ComingUpList"));
  assert.match(coming, /<GameCard league=\{g\.league\} game=\{g\} showLeague \/>/);
  const live = src.slice(src.indexOf("export function LiveNowList"), src.indexOf("export function ComingUpList"));
  assert.doesNotMatch(live, /showLeague/);
});

test("the footer links the tennis rankings pages, lists no destination twice and files Top Games under More", () => {
  const src = read("src/components/Footer.tsx");
  assert.match(src, /label: "ATP rankings", href: "\/tennis\/atp\/rankings"/);
  assert.match(src, /label: "WTA rankings", href: "\/tennis\/wta\/rankings"/);
  assert.match(src, /title="More"/);
  assert.doesNotMatch(src, /F1 & more/);
  const links = [...src.matchAll(/label: "([^"]+)", href: "(\/[^"]*)"/g)].map((m) => ({ label: m[1], href: m[2] }));
  const hrefs = links.map((l) => l.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "no href appears twice");
  // The men's and women's cricket columns are told apart by the link text itself.
  const labels = links.map((l) => l.label);
  const dupes = labels.filter((n, i) => labels.indexOf(n) !== i);
  assert.deepEqual(dupes, []);
});

test("the hero counts players with stats, not player pages, from the same count as before", () => {
  const picker = read("src/components/home/SportPicker.tsx");
  assert.match(picker, /counts\.playerPages\.toLocaleString\("en-GB"\)\}<\/b> players with stats/);
  assert.doesNotMatch(picker, /player pages</);
});

test("the first-visit page says there is no sign-up twice (hero and the trust list), not in every module", () => {
  const picker = read("src/components/home/SportPicker.tsx");
  const view = read("src/components/home/HomeExplainersView.tsx");
  const explainers = read("src/lib/homeExplainers.ts");
  assert.match(picker, /<span>No sign-up<\/span>/);
  assert.match(explainers, /title: "Nothing to sign up for"/);
  const firstVisit = picker + view + explainers;
  assert.doesNotMatch(firstVisit, /\bno account\b/i);
});
