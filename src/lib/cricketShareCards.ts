// What the share card of a cricket series page and of a cricket match page shows. Pure: the image routes
// (cricket/series/[id]/opengraph-image.tsx, cricket/matches/[id]/opengraph-image.tsx) draw these models and
// fetch nothing but the crests. Both pages sent the site's generic card before, so a series link on social
// looked like the homepage.
import { formatSeriesDates, SERIES_KIND_LABEL, type SeriesKind } from "./cricketSeriesDisplay";
import { seriesFormatTitles } from "./cricketSeriesSeo";
import type { CricketSeriesStats } from "./cricketSeriesStats";
import { classifyCricketMatch, cricketMatchWhen, seriesMatchesToPlay } from "./cricketMatchStatus";
import { cricketResultLine } from "./cricketResult";
import { splitScoreText } from "./gameDisplay";
import { normalizeStage } from "./stage";

export interface CardFact {
  label: string;
  value: string;
}

export interface SeriesCardModel {
  /** "Domestic cricket · First-class": the kind of series and its formats. */
  eyebrow: string;
  title: string;
  /** "Oct 4, 2026 – Mar 28, 2027"; null without a start date. */
  dates: string | null;
  /** Up to three rows: the table leader, most runs, most wickets, then the match count while there is room. */
  facts: CardFact[];
}

interface SeriesCardFields {
  name: string;
  kind: SeriesKind;
  formats: string[];
  start_date: string | null;
  end_date: string | null;
  match_count: number;
  completed_count: number;
  called_off_count: number;
}

/** The points table's top row, as the series page reads it. */
export interface TableLeader {
  team: string;
  points: number;
  played: number;
}

const FACT_ROWS = 3;

function seriesEyebrow(kind: SeriesKind, formats: string[]): string {
  const what = kind === "other" ? "Cricket" : `${SERIES_KIND_LABEL[kind]} cricket`;
  const titles = seriesFormatTitles(formats);
  return titles.length > 0 ? `${what} · ${titles.join(" · ")}` : what;
}

function matchCountFact(s: SeriesCardFields): CardFact | null {
  if (s.match_count <= 0) return null;
  const matches = `${s.match_count} ${s.match_count === 1 ? "match" : "matches"}`;
  if (s.completed_count <= 0) return { label: "Matches", value: matches };
  if (seriesMatchesToPlay(s) === 0) return { label: "Matches", value: `${matches}, all played` };
  return { label: "Matches", value: `${matches}, ${s.completed_count} played` };
}

/**
 * A series card: the series named large under its kind and formats, its dates, then what has happened in it.
 * The leaders are the stored scorecards' (cricketSeriesStats.ts); the table leader is ESPN's top row when the
 * page shows one table. A series with none of those shows how far along it is.
 */
export function cricketSeriesCardModel(s: SeriesCardFields, stats: CricketSeriesStats | null, leader: TableLeader | null): SeriesCardModel {
  const facts: CardFact[] = [];
  // ESPN publishes a table before the first ball, every side on 0 from 0: a top row nobody has played for says nothing.
  if (leader && leader.played > 0) facts.push({ label: "Leads the table", value: `${leader.team} · ${leader.points} pts, ${leader.played} played` });
  if (stats?.batting[0]) facts.push({ label: "Most runs", value: `${stats.batting[0].name} · ${stats.batting[0].runs}` });
  if (stats?.bowling[0]) facts.push({ label: "Most wickets", value: `${stats.bowling[0].name} · ${stats.bowling[0].wickets}` });
  const count = facts.length < FACT_ROWS ? matchCountFact(s) : null;
  if (count) facts.push(count);
  return { eyebrow: seriesEyebrow(s.kind, s.formats), title: s.name, dates: formatSeriesDates(s.start_date, s.end_date), facts };
}

/** The season archive's card: the year and how many series it lists. */
export function cricketSeasonCardModel(season: number, count: number): SeriesCardModel {
  return { eyebrow: "Cricket series", title: `${season} Cricket Series`, dates: null, facts: [{ label: "Series", value: `${count} series, leagues and tournaments` }] };
}

export interface MatchCardSide {
  /** ESPN's team id, for the crest substitutes; null when the listing stored no side. */
  id: string | null;
  name: string;
  logo: string | null;
  /** The score split for the big-figure layout; null before play and for a side yet to bat. */
  score: { main: string; detail: string | null } | null;
  /** The side that lost a decided match is drawn dimmer. */
  muted: boolean;
}

export interface MatchCardModel {
  /** "14th Match · President's Trophy 2026-27". */
  eyebrow: string;
  /** "Result · Sep 30, 2026", "Live · Sep 30, 04:30 UTC", a fixture's start, or the date and reason when called off. */
  when: string;
  /** Home side first, as the match page lists them. */
  sides: [MatchCardSide, MatchCardSide];
  /** Between the sides: "vs" for a fixture, the reason for a called-off match, ESPN's summary for a result with no scores. */
  middle: string | null;
  /** Under the sides: the result in full names, the live summary, or a fixture's ground. */
  line: string | null;
}

interface MatchSideFields {
  id: string;
  name: string;
  abbreviation?: string | null;
  score: string | null;
  winner: boolean;
  logo: string | null;
}

interface MatchCardFields {
  name: string;
  series_name: string;
  description: string | null;
  date: string;
  status_state: "pre" | "in" | "post" | null;
  status_summary: string | null;
  venue: string | null;
  home: MatchSideFields | null;
  away: MatchSideFields | null;
}

function side(stored: MatchSideFields | null, fallbackName: string, scored: boolean, muted: boolean): MatchCardSide {
  const score = scored && stored?.score ? splitScoreText(stored.score) : null;
  return { id: stored?.id ?? null, name: stored?.name ?? fallbackName, logo: stored?.logo ?? null, score, muted };
}

/**
 * A match card in the game card's shape: both crests, the scores once there are any, and the result line.
 * A result is written in full names from the summary (cricketResult.ts); when the summary cannot be put into
 * words it is shown as ESPN sent it. Sides a listing has not stored are named from the match name.
 */
export function cricketMatchCardModel(m: MatchCardFields): MatchCardModel {
  const kind = classifyCricketMatch(m);
  const stage = normalizeStage(m.description);
  const eyebrow = [stage, m.series_name].filter(Boolean).join(" · ");
  const when = kind === "result" ? `Result · ${cricketMatchWhen(m)}` : kind === "live" ? `Live · ${cricketMatchWhen(m)}` : cricketMatchWhen(m);
  const [homeName, awayName] = m.name.split(/ vs? /);
  const scored = kind === "result" || kind === "live";
  const decided = kind === "result" && (m.home?.winner ?? false) !== (m.away?.winner ?? false);
  const home = side(m.home, homeName ?? m.name, scored, decided && !m.home?.winner);
  const away = side(m.away, awayName ?? "TBC", scored, decided && !m.away?.winner);
  const summary = m.status_summary?.trim() || null;
  const middle = typeof kind === "object" ? kind.calledOff : kind === "fixture" ? "vs" : kind === "result" && !home.score && !away.score ? summary : null;
  let line: string | null = null;
  if (kind === "result" && middle === null) line = (m.home && m.away ? cricketResultLine(m.home, m.away, summary) : null) ?? summary;
  else if (kind === "live") line = summary;
  else if (kind === "fixture") line = m.venue;
  return { eyebrow, when, sides: [home, away], middle, line };
}
