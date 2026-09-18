/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// Pure parsing of ESPN's cross-tour tennis daily listing, shared by the scraper
// (scripts/fetch-tennis-daily.ts) and the live overlay (tennisLive.ts). No database
// access here.
import type { Tour } from "./tennisTours";

export const TENNIS_HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=tennis&dates=";
export const LEAGUE_TOUR: Record<string, Tour> = { "851": "atp", "900": "wta" };

export interface FeedSide {
  ids: string[];
  names: string[];
  countries: (string | null)[];
  seed: number | null;
  rank: number | null;
  score: string | null;
  sets: { games: number; tiebreak: number | null; winner: boolean }[];
}

export interface FeedMatch {
  id: string;
  tour: Tour;
  tournamentId: string;
  tournamentName: string;
  location: string | null;
  major: boolean;
  type: string;
  round: string | null;
  roundNumber: number | null;
  court: string | null;
  date: string;
  day: string;
  completed: boolean;
  statusState: string | null;
  statusDetail: string | null;
  winnerSide: 1 | 2 | null;
  sides: [FeedSide, FeedSide];
}

// The calendar date ESPN files a match under: its scores page is a US Eastern day.
export function easternDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function countryFromLogo(url: unknown): string | null {
  const m = typeof url === "string" ? url.match(/countries\/500\/([a-z]{2,3})\.png/i) : null;
  return m ? m[1].toUpperCase() : null;
}

// The feed's note gives the result in full names — "(4) Aneta Kucmova (CZE) & Aneta
// Laboutkova (CZE) bt Alevtina Ibragimova (RUS) & Ksenia Zaytseva (RUS) 4-6 6-2" —
// the only place a doubles pair's full names appear (the competitor row abbreviates
// them to "A. Kucmova / A. Laboutkova").
function namesFromNote(text: string | undefined, winnerFirst: boolean): [{ names: string[]; countries: string[] }, { names: string[]; countries: string[] }] | null {
  if (!text) return null;
  const parts = text.split(/\s+(?:bt|def\.?|d\.)\s+/);
  if (parts.length !== 2) return null;
  const parse = (s: string) => {
    const names: string[] = [];
    const countries: string[] = [];
    for (const m of s.matchAll(/(?:\((?:\d+|[A-Z]+)\)\s*)?([^()&]+?)\s*\(([A-Z]{3})\)/g)) {
      names.push(m[1].trim());
      countries.push(m[2]);
    }
    return { names, countries };
  };
  const a = parse(parts[0]);
  const b = parse(parts[1]);
  if (a.names.length === 0 || b.names.length === 0) return null;
  return winnerFirst ? [a, b] : [b, a];
}

function parseSide(c: any): FeedSide {
  const ids = String(c.id ?? "").split("-").filter((s) => /^\d+$/.test(s));
  const names = String(c.displayName ?? c.name ?? "")
    .split(" / ")
    .map((s) => s.trim())
    .filter(Boolean);
  const country = countryFromLogo(c.logo);
  const sets = (c.linescores ?? [])
    .filter((l: any) => typeof l.setScore === "number" || typeof l.score === "number")
    .map((l: any) => ({ games: Number(l.setScore ?? l.score), tiebreak: typeof l.tiebreak === "number" ? l.tiebreak : null, winner: l.winner === true }));
  return {
    ids,
    names,
    countries: names.map((_, i) => (i === 0 ? country : null)),
    seed: typeof c.tournamentSeed === "number" ? c.tournamentSeed : null,
    rank: typeof c.rank === "number" ? c.rank : null,
    score: typeof c.score === "string" && c.score ? c.score : null,
    sets,
  };
}

/** One event of the feed as a match, or null for a slot not yet decided. */
export function parseTennisEvent(leagueId: string, e: any): FeedMatch | null {
  const type: string = e.competitionType?.slug ?? "";
  if (!type || !e.competitionId || !e.date) return null;
  const competitors: any[] = e.competitors ?? [];
  if (competitors.length !== 2) return null;
  if (competitors.some((c) => !/^\d+(-\d+)?$/.test(String(c.id ?? "")) || /^tbd$/i.test(String(c.displayName ?? "")))) return null;

  const tour: Tour = type.startsWith("womens") ? "wta" : type.startsWith("mens") ? "atp" : (LEAGUE_TOUR[leagueId] ?? "atp");
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  const sides: [FeedSide, FeedSide] = [parseSide(home), parseSide(away)];

  const note = (e.notes ?? [])[0];
  const noteType: string = typeof note?.type === "string" ? note.type : "";
  const [round, court] = noteType.includes(" - ") ? noteType.split(/\s+-\s+/, 2) : [noteType || null, null];
  const state: string | null = e.fullStatus?.type?.state ?? e.status ?? null;
  const completed = e.fullStatus?.type?.completed === true || state === "post";
  const winnerSide: 1 | 2 | null = home.winner === true ? 1 : away.winner === true ? 2 : null;

  const full = completed && winnerSide ? namesFromNote(note?.text, winnerSide === 1) : null;
  if (full) {
    for (const i of [0, 1] as const) {
      if (full[i].names.length === sides[i].ids.length || sides[i].names.length !== sides[i].ids.length) {
        sides[i].names = full[i].names;
        sides[i].countries = full[i].countries;
      } else {
        sides[i].countries = sides[i].countries.map((c, j) => c ?? full[i].countries[j] ?? null);
      }
    }
  }

  return {
    id: String(e.competitionId),
    tour,
    tournamentId: String(e.id),
    tournamentName: String(e.name ?? e.shortName ?? ""),
    location: typeof e.location === "string" ? e.location : null,
    major: e.major === true,
    type,
    round: round ? round.trim() : null,
    roundNumber: typeof e.round === "number" ? e.round : null,
    court: court ? court.trim() : null,
    date: e.date,
    day: easternDay(e.date),
    completed,
    statusState: state,
    statusDetail: e.fullStatus?.type?.detail ?? e.summary ?? null,
    winnerSide,
    sides,
  };
}
