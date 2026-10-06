// The title and description of a cricket series page, in the words searchers use ("fixtures", "results",
// "points table"). Pure, shared by the page and its tests.

// A series row's `formats` are ESPN's class cards as stored. In a search snippet "(Other OD)" meant nothing
// to a reader, so each card has a reader's label; the catch-all card has none.
const FORMAT_LABEL: Record<string, string | null> = {
  "Other OD": "one-day",
  "Other T20": "T20",
  Twenty20: "T20",
  "Other match": null,
  "Women T20": "women's T20",
  "Women's T20": "women's T20",
  "Women's ODI": "women's ODI",
  "Women's Test": "women's Test",
  "List A": "List A",
  "First-class": "first-class",
  "Youth ODI": "youth ODI",
  "Youth T20": "youth T20",
  "Youth Test": "youth Test",
};

/** A class card as the label on a card or row ("One-day", "T20", "First-class", "Women's T20"); null for a card that says nothing. */
export function cricketFormatTitle(card: string | null | undefined): string | null {
  if (!card) return null;
  const label = card in FORMAT_LABEL ? FORMAT_LABEL[card] : card;
  return label ? label[0].toUpperCase() + label.slice(1) : null;
}

/** The formats as labels, in the order given, without repeats. */
export function seriesFormatTitles(formats: string[]): string[] {
  const out: string[] = [];
  for (const f of formats) {
    const label = cricketFormatTitle(f);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** The formats in a reader's words, in the order given, without repeats; a card with no label is skipped. */
export function seriesFormatLabels(formats: string[]): string[] {
  const out: string[] = [];
  for (const f of formats) {
    const label = f in FORMAT_LABEL ? FORMAT_LABEL[f] : f;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

interface SeriesSeoFields {
  name: string;
  formats: string[];
  teams: { name: string }[];
}

function list(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Longest form first for fitTitle. The points table is named only when the page shows one, and "points table" (the
 * query, per Search Console) outlives "fixtures" when the long form does not fit.
 */
export function cricketSeriesTitleCandidates(s: { name: string }, hasTable: boolean): string[] {
  return [...(hasTable ? [`${s.name} Fixtures, Results & Points Table`, `${s.name} Points Table & Results`] : []), `${s.name} Fixtures & Results`, s.name];
}

// What a search result shows of a description; a team list cut mid-name says less than no list.
const DESCRIPTION_LIMIT = 160;

/**
 * What the page holds, the format in words, and the teams when there are four or fewer and they fit. With `leaders`
 * (the series' most runs and most wickets, see cricketSeriesStats.ts) the format tail gives way to them, so the
 * snippet names the players and moves as the series does.
 */
export function cricketSeriesDescription(s: SeriesSeoFields, hasTable: boolean, leaders?: string | null): string {
  if (leaders) return `${s.name}: ${hasTable ? "points table, results and live scores" : "fixtures, results and live scores"}. ${leaders}`;
  const holds = hasTable ? "fixtures, results, points table and live scores" : "fixtures, results and live scores";
  const format = list(seriesFormatLabels(s.formats));
  const base = `${s.name}: ${holds} for every ${format ? `${format} ` : ""}match`;
  const withTeams = s.teams.length > 0 && s.teams.length <= 4 ? `${base} between ${list(s.teams.map((t) => t.name))}.` : null;
  return withTeams && withTeams.length <= DESCRIPTION_LIMIT ? withTeams : `${base}, with the scorecard of each.`;
}
