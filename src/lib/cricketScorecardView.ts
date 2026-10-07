// The scorecard as innings tabs: each block of the scorecard with its label, the side's colour, the extras,
// the total line and the fall of wickets, the last three from the ball-by-ball when the match has one.
import { scorecardBlocks, type ScorecardBlock } from "@/components/CricketScorecard";
import type { CricketTeamScorecard } from "./matchDetail";
import type { StoryInnings } from "./cricketBalls";

export interface ScorecardTabData {
  key: string;
  team: string;
  /** "West Indies · 171 all out (19.1 ov)". */
  label: string;
  colour: string | null;
  block: ScorecardBlock;
  extras: {
    /** The innings total less the batters' runs; null when the total is unknown. */
    total: number | null;
    /** "b 0, lb 4, w 3, nb 1" from the balls' flags; null without a ball-by-ball. */
    breakdown: string | null;
  };
  /** "171 all out · 19.1 overs · run rate 8.92"; null without an innings total. */
  totalLine: string | null;
  /** "1-38 Pooran (4.3), 2-44 Hetmyer (5.2)"; null without a ball-by-ball. */
  fallOfWickets: string | null;
}

const num = (s: string | undefined) => (s != null && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null);
const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
/** 19.1 overs as 115 balls. */
const ballsOf = (overs: number) => Math.floor(overs) * 6 + Math.round((overs % 1) * 10);

function breakdownOf(inn: StoryInnings): string {
  let b = 0;
  let lb = 0;
  let w = 0;
  let nb = 0;
  for (const over of inn.overs) {
    for (const ball of over.balls) {
      if (ball.extra === "wd") w += ball.runs;
      else if (ball.extra === "nb") nb += 1;
      else if (ball.extra === "b") b += ball.runs;
      else if (ball.extra === "lb") lb += ball.runs;
    }
  }
  return `b ${b}, lb ${lb}, w ${w}, nb ${nb}`;
}

export function scorecardTabs(scorecard: CricketTeamScorecard[], story: StoryInnings[], colours: Record<string, string>): ScorecardTabData[] {
  return scorecardBlocks(scorecard).map((block) => {
    const period = /^\d+$/.test(block.key) ? Number(block.key) : null;
    // Reports stored before innings were tracked key their blocks by team instead of period.
    const inn = (period !== null ? story.find((i) => i.period === period) : story.find((i) => i.teamId === block.key)) ?? null;
    const team = (period !== null ? scorecard.find((t) => (t.innings ?? []).some((i) => i.period === period)) ?? scorecard.find((t) => t.battingRows.some((r) => r.innings === period)) : scorecard.find((t) => t.teamId === block.key)) ?? null;
    const total = period !== null ? team?.innings?.find((i) => i.period === period) ?? null : null;
    const colour = (inn ? colours[inn.teamId] : null) ?? (team ? colours[team.teamId] : null) ?? null;

    const batted = block.batting.rows.reduce((sum, r) => sum + (num(r.stats[0]) ?? 0), 0);
    const extrasTotal = total && total.runs - batted >= 0 ? total.runs - batted : null;

    let totalLine: string | null = null;
    if (total) {
      const note = total.description.toLowerCase();
      const score = total.wickets >= 10 || note === "all out" ? `${total.runs} all out` : note.includes("declared") ? `${total.runs}/${total.wickets} declared` : `${total.runs}/${total.wickets}`;
      const balls = ballsOf(total.overs);
      const rate = inn?.runRate ?? (balls > 0 ? total.runs / (balls / 6) : null);
      totalLine = [score, `${total.overs} overs`, rate !== null ? `run rate ${rate.toFixed(2)}` : null].filter(Boolean).join(" · ");
    }
    const fallOfWickets = inn && inn.wickets.length > 0 ? inn.wickets.map((w) => `${w.wicket}-${w.runs} ${surname(w.batter)} (${w.over})`).join(", ") : null;
    const label = `${block.team}${block.total ? ` · ${block.total}` : block.label && block.label !== "innings" ? ` · ${block.label}` : ""}`;
    return { key: block.key, team: block.team, label, colour, block, extras: { total: extrasTotal, breakdown: inn ? breakdownOf(inn) : null }, totalLine, fallOfWickets };
  });
}

/** A strike rate as a bar width (percent of the cell): 250 fills it. */
export const strikeRateWidth = (sr: string): number => {
  const n = num(sr);
  return n === null || n <= 0 ? 0 : Math.min(100, Math.round((n / 250) * 1000) / 10);
};

/** An economy rate as a bar width: 20 an over fills it. */
export const economyWidth = (econ: string): number => {
  const n = num(econ);
  return n === null || n <= 0 ? 0 : Math.min(100, Math.round((n / 20) * 1000) / 10);
};

/** The innings a `?innings=` query asks for, or the first when it names none the page has. */
export function inningsFromQuery(search: string, keys: string[]): string {
  const asked = new URLSearchParams(search).get("innings");
  return asked !== null && keys.includes(asked) ? asked : keys[0];
}
