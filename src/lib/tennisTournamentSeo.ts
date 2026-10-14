// The title and description of a tennis tournament page, in the words searchers type: "results",
// "draw", "scores", "champions". Search Console (28 days to 2026-10-02): 182 tournament pages, 737
// impressions, 1 click under the bare "China Open 2026 | SportsDB".
import { COMPETITION_LABEL } from "./tennisCompetitions";
import { formatTournamentRange, tournamentInPlay } from "./tennisDates";

export interface TournamentSeoFields {
  name: string;
  season: number;
  location: string | null;
  tour: "atp" | "wta" | "both";
  start_date: string | null;
  end_date: string | null;
  match_count: number;
  completed_count: number;
  champions: { competition_type: string; names: string[] }[];
}

// Other names the same event is searched under; keyed by the cleaned name.
const ALIASES: Record<string, string[]> = {
  "National Bank Open": ["Canadian Open"],
};

export function tournamentAliases(cleanName: string): string[] {
  return ALIASES[cleanName] ?? [];
}

/**
 * The name people search: ESPN files the sponsor into it ("Miami Open presented by Itau", "BMW Open by Bitpanda",
 * "Transylvania Open powered by Kaufland"), and sometimes the year too ("Axeria Open 2026 powered by ..."), which the
 * title adds again. The sponsor tail goes from its first "presented by", "powered by" or "by"; a name that would
 * come out empty or tiny is left as filed.
 */
export function tournamentDisplayName(name: string, season: number): string {
  const cut = name
    .replace(/\s+(?:presented|powered)\s+by\b.*$/i, "")
    .replace(/\s+by\s+.+$/i, "")
    .replace(new RegExp(`\\s*\\b${season}\\b`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
  return cut.length >= 3 ? cut : name;
}

export type TournamentState = "upcoming" | "live" | "finished";

/** On `today` (an Eastern date, see tennisDates.ts): before its dates upcoming, inside them live until the singles final, then finished. */
export function tournamentState(t: TournamentSeoFields, today: string): TournamentState {
  if (tournamentInPlay(t, today)) return "live";
  if (t.start_date && t.start_date.slice(0, 10) > today) return "upcoming";
  if (!t.start_date && t.match_count === 0) return "upcoming";
  return "finished";
}

/** Longest form first, for fitTitle; the bare name and season last. */
export function tennisTournamentTitleCandidates(t: TournamentSeoFields, today: string): string[] {
  const base = `${tournamentDisplayName(t.name, t.season)} ${t.season}`;
  switch (tournamentState(t, today)) {
    case "finished":
      return [`${base} Results, Scores & Champions`, `${base} Results & Scores`, `${base} Results`, base];
    case "live":
      return [`${base} Live Scores, Draw & Results`, `${base} Scores & Results`, `${base} Results`, base];
    default:
      return [`${base} Draw, Schedule & Results`, `${base} Draw & Schedule`, `${base} Draw`, base];
  }
}

export function tennisTournamentDescription(t: TournamentSeoFields, today: string): string {
  const clean = tournamentDisplayName(t.name, t.season);
  const alias = tournamentAliases(clean);
  const base = `${clean} ${t.season}${alias.length ? ` (${alias.join(", ")})` : ""}`;
  const from = t.location ? ` from ${t.location}` : "";
  const range = formatTournamentRange(t.start_date, t.end_date);
  const when = range ? `, ${range}` : "";
  switch (tournamentState(t, today)) {
    case "finished": {
      const champions = t.champions.map((c) => `${COMPETITION_LABEL[c.competition_type as keyof typeof COMPETITION_LABEL] ?? c.competition_type}: ${c.names.join(" / ")}`).join("; ");
      return `${base} results${from}: every match by round with set scores${champions ? `. ${champions}` : ""}.`;
    }
    case "live":
      return `${base} live scores and results${from}${when}: every match by round with set scores, updated through the event.`;
    default:
      return `${base} draw and schedule${from}${when}. Results and set scores for every match once play begins.`;
  }
}
