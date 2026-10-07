// The key-moments timeline: the wickets of the ball-by-ball (or the scorecard's dismissal lines) and ESPN's
// match notes rewritten, from their parsed fields, into SportsDB's own sentences.
import type { StoryInnings } from "./cricketBalls";
import type { CricketTeamScorecard } from "./matchDetail";
import { wicketLine } from "./cricketMatchExtras";

export type MomentKind = "wicket" | "team" | "batter" | "stand" | "powerplay" | "drinks" | "break";

export interface Milestone {
  /** Match innings number, counted from the "<Team> innings" notes. */
  innings: number;
  /** Overs in cricket notation (13.5 = 13 overs and 5 balls), for ordering against the wickets. */
  over: number;
  kind: Exclude<MomentKind, "wicket">;
  text: string;
}

export interface Moment {
  innings: number;
  /** null when the source gives no over (a scorecard dismissal line). */
  over: number | null;
  kind: MomentKind;
  text: string;
  teamId: string | null;
}

const ORDINAL = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const overNum = (s: string) => Number(s);
const oversText = (s: string) => (s.endsWith(".0") ? s.slice(0, -2) : s);

/** "3 x 4, 2 x 6" as "3 fours, 2 sixes" (singulars when one; nothing when zero). */
function boundaries(s: string): string {
  const out: string[] = [];
  const fours = /(\d+) x 4/.exec(s);
  const sixes = /(\d+) x 6/.exec(s);
  if (fours && Number(fours[1]) > 0) out.push(`${fours[1]} ${fours[1] === "1" ? "four" : "fours"}`);
  if (sixes && Number(sixes[1]) > 0) out.push(`${sixes[1]} ${sixes[1] === "1" ? "six" : "sixes"}`);
  return out.join(", ");
}

/** "RG Sharma" as "Rohit Sharma" when one of `names` has that surname and first initial; else as written. */
export function resolveShortName(short: string, names: string[]): string {
  const parts = short.trim().split(/\s+/);
  if (parts.length < 2) return short;
  const initials = parts[0];
  const surname = parts.slice(1).join(" ").toLowerCase();
  const hits = names.filter((n) => {
    const words = n.trim().split(/\s+/);
    return words.length >= 2 && words.slice(1).join(" ").toLowerCase() === surname && words[0][0]?.toUpperCase() === initials[0]?.toUpperCase();
  });
  return hits.length === 1 ? hits[0] : short;
}

/**
 * ESPN's `matchnote` entries as milestones. Only the shapes known from the feed are kept (team fifties,
 * batter landmarks, partnership fifties, powerplays, drinks, the innings break); anything else is dropped
 * rather than shown in ESPN's words.
 */
export function parseMilestones(notes: unknown, names: string[] = []): Milestone[] {
  if (!Array.isArray(notes)) return [];
  const out: Milestone[] = [];
  let innings = 0;
  let lastOver = 0;
  for (const n of notes) {
    if (!n || typeof n !== "object" || (n as { type?: unknown }).type !== "matchnote" || typeof (n as { text?: unknown }).text !== "string") continue;
    const text = ((n as { text: string }).text as string).replace(/\s+/g, " ").trim();
    let m: RegExpExecArray | null;
    if (/^.+ innings$/i.test(text) && !text.includes(":")) {
      innings += 1;
      lastOver = 0;
      continue;
    }
    if (innings === 0) continue;
    if ((m = /^(.+?): (\d+) runs in ([\d.]+) overs \((\d+) balls\)/.exec(text))) {
      lastOver = overNum(m[3]);
      out.push({ innings, over: lastOver, kind: "team", text: `${m[1]} ${m[2]} up in ${oversText(m[3])} overs` });
    } else if ((m = /^(.+?): (\d+) off (\d+) balls \((.*)\)$/.exec(text))) {
      const b = boundaries(m[4]);
      out.push({ innings, over: lastOver, kind: "batter", text: `${resolveShortName(m[1], names)} ${m[2]} off ${m[3]} balls${b ? ` (${b})` : ""}` });
    } else if ((m = /^(\d+)(?:st|nd|rd|th) Wicket: (\d+) runs in (\d+) balls/.exec(text))) {
      out.push({ innings, over: lastOver, kind: "stand", text: `${ORDINAL(Number(m[1]))}-wicket stand ${m[2]} in ${m[3]} balls` });
    } else if ((m = /^Powerplay (\d+): Overs ([\d.]+) - ([\d.]+) \((?:[A-Za-z]+ - )?(\d+) runs?, (\d+) wickets?\)$/.exec(text))) {
      lastOver = overNum(m[3]);
      out.push({ innings, over: lastOver, kind: "powerplay", text: `Powerplay ${m[1]} (overs ${m[2]} to ${m[3]}): ${m[4]} runs, ${m[5]} wicket${m[5] === "1" ? "" : "s"}` });
    } else if ((m = /^Drinks: (.+?) - (\d+)\/(\d+) in ([\d.]+) overs/.exec(text))) {
      lastOver = overNum(m[4]);
      out.push({ innings, over: lastOver, kind: "drinks", text: `Drinks: ${m[1]} ${m[2]}/${m[3]} after ${oversText(m[4])} overs` });
    } else if ((m = /^Innings Break: (.+?) - (\d+)\/(\d+) in ([\d.]+) overs/.exec(text))) {
      lastOver = overNum(m[4]);
      out.push({ innings, over: lastOver, kind: "break", text: `Innings break: ${m[1]} ${m[2]}/${m[3]} in ${oversText(m[4])} overs` });
    }
  }
  return out;
}

const KIND_ORDER: Record<MomentKind, number> = { wicket: 0, team: 1, batter: 2, stand: 3, powerplay: 4, drinks: 5, break: 6 };

/**
 * The timeline, innings by innings and over by over: every wicket (from the ball-by-ball when there is one,
 * else from the scorecard's dismissal lines, which carry no over) and the milestones that fall in that innings.
 */
export function keyMoments(story: StoryInnings[], milestones: Milestone[], scorecard: CricketTeamScorecard[] = []): Moment[] {
  const out: Moment[] = [];
  if (story.length > 0) {
    for (const inn of story) {
      for (const w of inn.wickets) out.push({ innings: inn.period, over: w.over, kind: "wicket", text: `${wicketLine(w)} · ${w.runs}/${w.wicket}`, teamId: inn.teamId });
    }
  } else {
    for (const team of scorecard) {
      for (const r of team.battingRows) {
        const d = r.dismissal?.trim();
        if (!d || /^not out|retired/i.test(d)) continue;
        const runs = /^\d+$/.test(r.stats[0] ?? "") ? ` ${r.stats[0]}` : "";
        out.push({ innings: r.innings ?? 1, over: null, kind: "wicket", text: `${r.name} ${d}${runs}`, teamId: team.teamId });
      }
    }
  }
  const teamOf = (innings: number) => story.find((i) => i.period === innings)?.teamId ?? scorecard.find((t) => t.battingRows.some((r) => (r.innings ?? 1) === innings))?.teamId ?? null;
  for (const m of milestones) out.push({ innings: m.innings, over: m.over, kind: m.kind, text: m.text, teamId: teamOf(m.innings) });
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.innings - b.m.innings || (a.m.over ?? -1) - (b.m.over ?? -1) || KIND_ORDER[a.m.kind] - KIND_ORDER[b.m.kind] || a.i - b.i)
    .map(({ m }) => m);
}
