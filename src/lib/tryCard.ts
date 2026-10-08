// The "Try a name" card on the first-visit homepage: a few figures, the last eight games as bars, and one
// line from the player's splits. Everything here is a pure function of rows the player's own page already
// reads (lib/queries.ts, lib/playerProfile.ts), so a figure on the card is the figure on the page; the
// database reads live in tryCardLoader.ts. Nothing imports the pool, so the island can use the types.
import { trunc2 } from "./cricketFormat";
import { playerClaims } from "./playerClaims";
import { positionLabel, type PlayerProfile, type PlayerSport } from "./playerProfile";
import { LEAGUE_LABEL, LEAGUE_SHORT, type League } from "./leagues";
import { followToBlock } from "./followBlocks";
import type { HomeBlock } from "./blockTypes";
import { careerStripStats } from "../components/PlayerStatsShared";

/** A split is quoted only from this many innings: one big match is not a record against a side. */
export const MIN_SPLIT_INNINGS = 5;
/** Bars on the card. */
export const CARD_BARS = 8;

export interface TryCardStat {
  value: string;
  label: string;
}

export interface TryCardBar {
  /** The bar's height figure: runs, wickets, goals. */
  value: number;
  /** The figure as printed above the bar ("112*", "5/23"). */
  label: string;
  /** "v Highveld": the tooltip. */
  title: string;
  href: string;
}

export interface TryCardInsight {
  lead: string;
  strong: string;
  tail: string;
}

export interface TryCard {
  league: string;
  leagueLabel: string;
  leagueShort: string;
  slug: string;
  name: string;
  href: string;
  team: string | null;
  /** Hex without "#", as stored; null when the team has none. */
  teamColor: string | null;
  /** Position or role; null when the feed has none worth showing. */
  role: string | null;
  stats: TryCardStat[];
  /** Where the stats come from: "ODIs on this site · 41 matches". */
  statsCaption: string | null;
  barsCaption: string | null;
  bars: TryCardBar[];
  insight: TryCardInsight | null;
  note: string | null;
  /** The player-form block a Follow adds; null for a person the homepage has no block for (tennis, F1). */
  block: HomeBlock | null;
  /** True when there is nothing to chart or total: the card then carries only the name and the links. */
  small: boolean;
}

export interface PlayerIdentity {
  league: string;
  slug: string;
  name: string;
  team_name: string | null;
  team_color: string | null;
  position?: string | null;
}

function base(p: PlayerIdentity, sport: PlayerSport | null, role: string | null): TryCard {
  const league = p.league as League;
  return {
    league: p.league,
    leagueLabel: LEAGUE_LABEL[league] ?? p.league,
    leagueShort: LEAGUE_SHORT[league] ?? p.league,
    slug: p.slug,
    name: p.name,
    href: `/${p.league}/players/${p.slug}`,
    team: p.team_name,
    teamColor: p.team_color && /^[0-9a-fA-F]{6}$/.test(p.team_color.replace(/^#/, "")) ? p.team_color.replace(/^#/, "").toLowerCase() : null,
    role: sport === null ? role : positionLabel(sport, p.position),
    stats: [],
    statsCaption: null,
    barsCaption: null,
    bars: [],
    insight: null,
    note: null,
    block: followToBlock({ kind: "player", league: p.league, refId: p.slug, label: p.name }),
    small: true,
  };
}

/** The fallback: a name, a team, and the way to the page. Never an empty box. */
export function smallCard(p: PlayerIdentity, sport: PlayerSport | null = null): TryCard {
  return base(p, sport, null);
}

// ---------------------------------------------------------------------------
// Cricket
// ---------------------------------------------------------------------------

export interface CricketCareerLike {
  matches: number;
  inningsBatted: number;
  runs: number;
  notOuts: number;
  hundreds: number;
  average: number | null;
  inningsBowled: number;
  wickets: number;
  economy: number | null;
  fiveWicketHauls: number;
}

export interface CricketInningsLike {
  game_espn_id: string;
  opponent_name: string;
  runs: number | null;
  not_out: boolean | null;
  wickets: number | null;
  conceded: number | null;
}

/** One opponent (or ground), counted per innings. The averages are derived here, never stored. */
export interface CricketSplitInnings {
  label: string;
  inningsBatted: number;
  dismissals: number;
  runs: number;
  inningsBowled: number;
  wickets: number;
  conceded: number;
}

export type CricketDiscipline = "batting" | "bowling";

/** Whether the card leads with runs or wickets: runs unless the wickets outweigh the runs at a bowler's usual 25 a wicket. */
export function primaryDiscipline(c: Pick<CricketCareerLike, "runs" | "wickets">): CricketDiscipline {
  return c.wickets > 0 && c.wickets * 25 > c.runs ? "bowling" : "batting";
}

export interface BestSplit {
  label: string;
  innings: number;
  /** Batting: runs per dismissal. Bowling: wickets per innings. */
  figure: number;
  runs: number;
  wickets: number;
  /** How many sides (or grounds) reached the innings floor: "the best of" is said only when there was more than one. */
  candidates: number;
}

/** The side (or ground) the player bats best against: highest average among those with at least `min` innings and a dismissal. Ties go to more innings, then the name. */
export function bestBattingSplit(rows: CricketSplitInnings[], min = MIN_SPLIT_INNINGS): BestSplit | null {
  const eligible = rows.filter((r) => r.inningsBatted >= min && r.dismissals >= 1);
  eligible.sort((a, b) => b.runs / b.dismissals - a.runs / a.dismissals || b.inningsBatted - a.inningsBatted || a.label.localeCompare(b.label));
  const top = eligible[0];
  return top ? { label: top.label, innings: top.inningsBatted, figure: top.runs / top.dismissals, runs: top.runs, wickets: 0, candidates: eligible.length } : null;
}

/** The side (or ground) he takes most wickets an innings against, among those bowled at in at least `min` innings. */
export function bestBowlingSplit(rows: CricketSplitInnings[], min = MIN_SPLIT_INNINGS): BestSplit | null {
  const eligible = rows.filter((r) => r.inningsBowled >= min && r.wickets >= 1);
  eligible.sort((a, b) => b.wickets / b.inningsBowled - a.wickets / a.inningsBowled || b.inningsBowled - a.inningsBowled || a.label.localeCompare(b.label));
  const top = eligible[0];
  return top ? { label: top.label, innings: top.inningsBowled, figure: top.wickets / top.inningsBowled, runs: 0, wickets: top.wickets, candidates: eligible.length } : null;
}

export interface CricketInsights {
  bestOpponent: BestSplit | null;
  bestVenue: BestSplit | null;
  discipline: CricketDiscipline;
}

export function cricketInsights(discipline: CricketDiscipline, opponents: CricketSplitInnings[], venues: CricketSplitInnings[]): CricketInsights {
  const pick = discipline === "batting" ? bestBattingSplit : bestBowlingSplit;
  return { bestOpponent: pick(opponents), bestVenue: pick(venues), discipline };
}

/** The one line under the bars. Opponent first, then ground; when neither has 5 innings the line points to the page and claims nothing. */
export function cricketInsightLine(ins: CricketInsights, floor = MIN_SPLIT_INNINGS): TryCardInsight {
  const one = (s: BestSplit, kind: "side" | "ground", preposition: string): TryCardInsight => {
    // "The best of" needs something to be best of: with one side over the floor the line just states the figure.
    const compared = (superlative: string, verb: string) => (s.candidates > 1 ? `, the ${superlative} of the ${s.candidates} ${kind === "side" ? "sides" : "grounds"} ${verb} in ${floor} or more innings on this site.` : ` on this site.`);
    if (ins.discipline === "batting") {
      const strong = `Averages ${trunc2(s.figure)} ${preposition} ${s.label}`;
      return { lead: "", strong, tail: ` in ${s.innings} innings${compared("best", "faced")}` };
    }
    const strong = `${trunc2(s.figure)} wickets an innings ${preposition} ${s.label}`;
    return { lead: "", strong, tail: ` (${s.wickets} in ${s.innings} innings)${compared("most", "bowled at")}` };
  };
  if (ins.bestOpponent) return one(ins.bestOpponent, "side", "against");
  if (ins.bestVenue) return one(ins.bestVenue, "ground", "at");
  return { lead: "", strong: "", tail: `No side or ground yet has ${floor} innings to compare. The full split by opponent, venue and team is on the player page.` };
}

export function cricketBars(rows: CricketInningsLike[], league: string, discipline: CricketDiscipline): { caption: string; bars: TryCardBar[] } {
  const usable = rows.filter((r) => (discipline === "batting" ? r.runs !== null : r.wickets !== null)).slice(0, CARD_BARS);
  const bars = usable
    .map((r) => ({
      value: discipline === "batting" ? (r.runs ?? 0) : (r.wickets ?? 0),
      label: discipline === "batting" ? `${r.runs}${r.not_out ? "*" : ""}` : `${r.wickets}/${r.conceded ?? 0}`,
      title: `v ${r.opponent_name}`,
      href: `/${league}/games/${r.game_espn_id}`,
    }))
    .reverse();
  return { caption: discipline === "batting" ? `Runs, last ${bars.length} innings` : `Wickets, last ${bars.length} innings`, bars };
}

export function cricketCard(p: PlayerIdentity, career: CricketCareerLike | null, innings: CricketInningsLike[], opponents: CricketSplitInnings[], venues: CricketSplitInnings[]): TryCard {
  const card = base(p, null, p.position && !/^(ukn|unk|unknown|n\/a|-+)$/i.test(p.position.trim()) ? p.position.trim() : null);
  if (!career) return card;
  const discipline = primaryDiscipline(career);
  const stats: TryCardStat[] =
    discipline === "batting"
      ? [
          { value: String(career.runs), label: "Runs" },
          { value: trunc2(career.average), label: "Average" },
          { value: String(career.hundreds), label: "100s" },
        ]
      : [
          { value: String(career.wickets), label: "Wickets" },
          { value: trunc2(career.economy), label: "Economy" },
          { value: String(career.fiveWicketHauls), label: "5w" },
        ];
  const { caption, bars } = cricketBars(innings, p.league, discipline);
  return {
    ...card,
    stats,
    statsCaption: `${card.leagueShort} on this site · ${career.matches} ${career.matches === 1 ? "match" : "matches"}`,
    barsCaption: bars.length > 0 ? caption : null,
    bars: bars.length >= 2 ? bars : [],
    insight: cricketInsightLine(cricketInsights(discipline, opponents, venues)),
    note: `On this site: ${card.leagueShort} from stored scorecards, not an all-time career total.`,
    small: false,
  };
}

// ---------------------------------------------------------------------------
// Football, basketball, American football, baseball
// ---------------------------------------------------------------------------

/**
 * The player page's own numbers: the first three tiles of its career strip (games, then the sport's first two headline
 * figures, as careerStripStats prints them) and the form chart's last eight games, newest on the right. The line under
 * the bars is the page's own claim when it makes one (a season high, a run of games), else the best of the bars shown.
 */
export function profileCard(p: PlayerIdentity, sport: PlayerSport, regular: PlayerProfile, counted: PlayerProfile, now: Date = new Date()): TryCard {
  const card = base(p, sport, null);
  const strip = careerStripStats(regular);
  const tiles = [strip[0], ...strip.slice(2, 4)].filter((s): s is NonNullable<typeof s> => !!s);
  const stats = regular.games > 0 ? tiles.map((s) => ({ value: s.value, label: s.label })) : [];
  const form = counted.form.slice(-CARD_BARS);
  const label = counted.profile.form.label;
  const bars: TryCardBar[] = form.map(({ row, value }) => ({
    value: value ?? 0,
    label: value === null ? "–" : String(value),
    title: `${row.is_home ? "vs" : "at"} ${row.opponent_name}`,
    href: `/${p.league}/games/${row.game_espn_id}`,
  }));
  if (stats.length === 0 && bars.length === 0) return card;

  const claim = regular.rows.length > 0 ? playerClaims(regular.rows, regular.profile.form, sport, { now })[0] : undefined;
  let insight: TryCardInsight | null = null;
  if (claim) insight = { lead: "", strong: claim, tail: "." };
  else if (bars.length >= 2) {
    const best = form.reduce((a, b) => ((b.value ?? -1) > (a.value ?? -1) ? b : a));
    if ((best.value ?? 0) > 0) insight = { lead: "Best of the last ", strong: `${bars.length}: ${best.value} ${label.toLowerCase()}`, tail: ` ${best.row.is_home ? "against" : "at"} ${best.row.opponent_name}.` };
  }
  const flagged = strip.find((s) => s.noBoxScore);
  return {
    ...card,
    stats,
    statsCaption: `${card.leagueLabel} · as on the player page`,
    barsCaption: bars.length >= 2 ? `${label}, last ${bars.length} games` : null,
    bars: bars.length >= 2 ? bars : [],
    insight,
    note: flagged?.title ?? null,
    small: stats.length === 0,
  };
}
