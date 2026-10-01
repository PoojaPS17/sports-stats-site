// Pure cricket-series types with no database import — safe to use from Client Components
// (see leagues.ts and tennisTours.ts: a *type-only* import of these from cricketSeries.ts
// still has Turbopack's dev module graph treat it as an edge to that file, which imports
// ./db and pulls `pg` into the client bundle, breaking it — so the types live here instead).
import type { League } from "./leagues";
import type { SeriesKind } from "./cricketSeriesDisplay";

export interface CricketSeries {
  espn_id: string;
  name: string;
  short_name: string | null;
  abbreviation: string | null;
  is_tournament: boolean;
  kind: SeriesKind;
  formats: string[];
  season: number | null;
  start_date: string | null;
  end_date: string | null;
  match_count: number;
  completed_count: number;
  /** Matches ESPN closed without playing (postponed, cancelled...): not finished, and not still to be played. */
  called_off_count: number;
  live_count: number;
  teams: { id: string; name: string; abbreviation: string | null; logo: string | null }[];
  /** The SportsDB competition this series is, when it is one (IPL, World Cups, ...). */
  league: League | null;
  /** Headline cricket (see cricketFeatured.ts): listed in live and upcoming, not only through the picker. */
  featured: boolean;
}

export interface SeriesSide {
  id: string;
  name: string;
  abbreviation: string | null;
  score: string | null;
  winner: boolean;
  logo: string | null;
}

export interface CricketSeriesMatch {
  espn_id: string;
  series_espn_id: string;
  series_name: string;
  series_kind: SeriesKind | null;
  date: string;
  name: string;
  short_name: string | null;
  description: string | null;
  class_card: string | null;
  /** ESPN's international class: 1 Test, 2 ODI, 3 T20I, 8-10 the women's equivalents, "0" for everything else. */
  international_class_id: string | null;
  status_state: "pre" | "in" | "post" | null;
  status_summary: string | null;
  home: SeriesSide | null;
  away: SeriesSide | null;
  /** SportsDB league holding this match's stored scorecard, when one exists. */
  scorecard_league: League | null;
}
