/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// Small facts the match page lifts from ESPN's summary and the match story: hero pills, team colours,
// the score split for display, and the sentence under an over's balls.
import type { StoryInnings, StoryOver, StoryWicket } from "./cricketBalls";

const clean = (s: string) => s.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();

/** The hero's outline pills, in a fixed order: toss, series state, match number, day/night. */
export function matchPills(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  const by = (type: string) => notes.find((n: any) => n?.type === type && typeof n.text === "string")?.text as string | undefined;
  const out: string[] = [];
  const toss = by("toss");
  if (toss) out.push(`Toss: ${clean(toss)}`);
  const series = by("seriesnote");
  // ESPN writes the series state in the past tense ("led"); the page is read in the present.
  if (series) out.push(clean(series).replace(/\bled\b/, "lead").replace(/\btrailed\b/, "trail"));
  const number = by("matchnumber");
  if (number) out.push(clean(number));
  const days = by("matchdays");
  if (days && /night match/i.test(days)) out.push(/day\/night/i.test(days) ? "Day/night match" : "Night match");
  return out;
}

const hex = (c: unknown): string | null => {
  if (typeof c !== "string") return null;
  const v = c.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
};

/** ESPN's team colours for the home and away competitor; none when either is missing or both are the same. */
export function teamColours(summary: unknown): { home: string | null; away: string | null } {
  const comps: any[] = (summary as any)?.header?.competitions?.[0]?.competitors ?? [];
  const home = hex(comps.find((c) => c?.homeAway === "home")?.team?.color ?? comps[0]?.team?.color);
  const away = hex(comps.find((c) => c?.homeAway === "away")?.team?.color ?? comps[1]?.team?.color);
  if (!home || !away || home === away) return { home: null, away: null };
  return { home, away };
}

/** "172/2 (14.4/20 ov, target 172)" as the figure and the bracketed detail. */
export function splitCricketScore(score: string): { main: string; detail: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(score.trim());
  if (!m) return { main: score.trim(), detail: null };
  return { main: m[1].trim(), detail: m[2].trim() || null };
}

/** A wicket as a scorecard line: "Kamil Pooran b Arshdeep Singh 12", "Shimron Hetmyer run out". */
function wicketLine(w: StoryWicket): string {
  const how = w.how.includes("run out")
    ? "run out"
    : w.how.includes("leg before")
      ? `lbw b ${w.bowler}`
      : w.how === "bowled"
        ? `b ${w.bowler}`
        : w.how === "caught"
          ? `c ${w.bowler}`
          : w.how === "stumped"
            ? `st ${w.bowler}`
            : w.bowler
              ? `${w.how} b ${w.bowler}`
              : w.how;
  return `${w.batter} ${how}${w.batterRuns === null ? "" : ` ${w.batterRuns}`}`;
}

/**
 * The sentence under an over's balls: each wicket in the over as a scorecard line, then the side's
 * score after it ("West Indies 44/3 after 6 overs.", "West Indies 171 all out.", "India 172/2, target reached.").
 */
export function overNote(over: StoryOver, innings: StoryInnings): string {
  const inOver = innings.wickets.filter((w) => Math.floor(w.over) === over.number - 1);
  const parts: string[] = [];
  if (inOver.length) parts.push(inOver.map(wicketLine).join("; ") + ".");
  const index = innings.overs.findIndex((o) => o.number === over.number);
  const point = innings.worm[index];
  if (point) {
    const allOut = point.wickets >= 10;
    const chased = innings.target !== null && point.runs >= innings.target;
    const score = allOut ? `${point.runs} all out` : `${point.runs}/${point.wickets}`;
    const tail = allOut ? "" : chased ? ", target reached" : Number.isInteger(point.over) ? ` after ${point.over} overs` : "";
    parts.push(`${innings.team} ${score}${tail}.`);
  }
  return parts.join(" ");
}
