// "On the brink": a player a few units short of a round number, scoped to ONE SEASON of a league.
//
// Why a season and never a career: a career total is only true when the archive holds every game the player
// ever played, and none of ours does. Cricket is partial by design (Tests since 2015, ODIs incomplete before
// 2009, women's since 2009) and the box-score history of every other sport starts around 2015, so "N from
// 10,000 career runs" or "N from 500 career goals" would be a claim about a total we do not hold. A season that
// is in progress, with every finished game's box score stored, is a total we do hold, and the leaders page
// reads it the same way (goals only for football: assists are credited differently by each data provider, so we
// could not confirm the figures against a second source), so the figure here is the figure the visitor finds one tap away.
// This file is the pure part: which leagues and figures qualify, and the sentence. The reads are in brinkData.ts.
import type { League } from "./leagues";

export type BrinkStat = "goals" | "passing_yards" | "rushing_yards" | "receiving_yards";

interface Rule {
  /** Leader-board column (player_season_stats / leaderQueries). */
  stat: BrinkStat;
  many: string;
  /** Round numbers are multiples of `step`, starting at `min`. */
  step: number;
  min: number;
  /** A player further than this from the next round number is not "on the brink". */
  maxGap: number;
}

const SOCCER: Rule[] = [
  { stat: "goals", many: "goals", step: 5, min: 10, maxGap: 3 },
];
const NFL: Rule[] = [
  { stat: "passing_yards", many: "passing yards", step: 1000, min: 1000, maxGap: 150 },
  { stat: "rushing_yards", many: "rushing yards", step: 1000, min: 1000, maxGap: 100 },
  { stat: "receiving_yards", many: "receiving yards", step: 1000, min: 1000, maxGap: 100 },
];

/**
 * The leagues a milestone can be claimed for, with their figures. The domestic football leagues and the NFL:
 * leagues whose season totals are summed from stored box scores (the leaders page's rule). Cricket is not here,
 * on purpose (see the top of the file); neither are the two UEFA cups (their boards are ESPN's stored rows, a
 * competition spread over phases) nor the NBA and MLB (their seasons are over or not stored).
 */
export const BRINK_RULES: Partial<Record<League, Rule[]>> = {
  epl: SOCCER,
  laliga: SOCCER,
  bundesliga: SOCCER,
  seriea: SOCCER,
  ligue1: SOCCER,
  mls: SOCCER,
  saudi: SOCCER,
  nfl: NFL,
};

export const BRINK_LEAGUES = Object.keys(BRINK_RULES) as League[];

/** True for a league a milestone may be claimed in. Cricket is never one. */
export function canClaimMilestone(league: string): boolean {
  return Object.prototype.hasOwnProperty.call(BRINK_RULES, league);
}

export interface BrinkCandidate {
  league: League;
  /** The season's year as the leaders page labels it. */
  season: number;
  stat: BrinkStat;
  playerId: string;
  name: string;
  slug: string;
  teamName: string | null;
  /** The season total so far. */
  value: number;
}

export interface BrinkItem extends BrinkCandidate {
  target: number;
  gap: number;
  /** "goals", "passing yards", ...; a figure within reach of a milestone is never 1, so always the plural. */
  unit: string;
}

/** The first round number above `value`, never below the rule's first milestone. */
export function nextTarget(rule: Rule, value: number): number {
  const next = (Math.floor(value / rule.step) + 1) * rule.step;
  return Math.max(next, rule.min);
}

function ruleFor(league: League, stat: BrinkStat): Rule | undefined {
  return BRINK_RULES[league]?.find((r) => r.stat === stat);
}

/** The milestone a candidate is on the brink of, or null when it is not close enough to one. */
export function brinkOf(c: BrinkCandidate): BrinkItem | null {
  const rule = ruleFor(c.league, c.stat);
  if (!rule || !Number.isInteger(c.value) || c.value < 0) return null;
  const target = nextTarget(rule, c.value);
  const gap = target - c.value;
  if (gap < 1 || gap > rule.maxGap) return null;
  return { ...c, target, gap, unit: rule.many };
}

export const MAX_ITEMS = 4;
export const MAX_PER_LEAGUE = 2;

/**
 * The few to show: the closest to their milestone first (as a share of what counts as close), then the bigger
 * milestone, then the bigger total; one line per league and figure, at most two per league, so one busy league does not take the module.
 */
export function selectBrink(candidates: readonly BrinkCandidate[]): BrinkItem[] {
  const seen = new Set<string>();
  const items: BrinkItem[] = [];
  for (const c of candidates) {
    const item = brinkOf(c);
    if (!item) continue;
    const key = `${c.league}:${c.playerId}:${c.stat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  const closeness = (i: BrinkItem) => i.gap / (ruleFor(i.league, i.stat)?.maxGap ?? 1);
  items.sort((a, b) => closeness(a) - closeness(b) || b.target - a.target || b.value - a.value || a.name.localeCompare(b.name));
  const perLeague = new Map<string, number>();
  const stats = new Set<string>();
  const out: BrinkItem[] = [];
  for (const i of items) {
    // One line per league and figure: five players tied at 14 goals are one story, not five.
    const statKey = `${i.league}:${i.stat}`;
    const n = perLeague.get(i.league) ?? 0;
    if (n >= MAX_PER_LEAGUE || stats.has(statKey)) continue;
    stats.add(statKey);
    perLeague.set(i.league, n + 1);
    out.push(i);
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** The sentence under a name; `scope` is the season as the site words it ("the 2026 MLS regular season"). */
export function brinkSentence(i: BrinkItem, scope: string): string {
  return `${fmt(i.value)} ${i.unit} in ${scope}, ${fmt(i.gap)} short of ${fmt(i.target)}.`;
}
