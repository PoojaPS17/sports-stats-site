import { isCricketLeague, isSoccerLeague, type League } from "./leagues";
import { cupNoteLabel } from "./gameNote";

// Stage labels arrive in every spelling the sources use ("Semi Final", "1st semi-final",
// "3rd Place Play-Off", "2nd QF"). One form each, Cricinfo's, so the same stage reads
// the same on every card, record and log. Labels no pattern claims pass through as
// given (a numbered match, "Round of 16 - 1st Leg", "Super Bowl LX").
const ORD = "(\\d+(?:st|nd|rd|th))";

const RULES: [RegExp, (m: RegExpMatchArray) => string | null][] = [
  [/^final$/i, () => "Final"],
  [new RegExp(`^(?:${ORD}\\s+)?semi[\\s-]?finals?$`, "i"), (m) => (m[1] ? `${m[1]} Semi-Final` : "Semi-Final")],
  [new RegExp(`^(?:${ORD}\\s+)?(?:quarter[\\s-]?finals?|qf)$`, "i"), (m) => (m[1] ? `${m[1]} Quarter-Final` : "Quarter-Final")],
  [new RegExp(`^${ORD}\\s+place\\s+play[\\s-]?off$`, "i"), (m) => `${m[1]} Place Play-off`],
  [/^qualifier(?:\s+(\d))?$/i, (m) => (m[1] ? `Qualifier ${m[1]}` : "Qualifier")],
  [new RegExp(`^${ORD}\\s+qualifying\\s+(final|match)$`, "i"), (m) => `${m[1]} Qualifying ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}`],
  [/^(?:.*\s)?qualif(?:ying|ication)\s+play[\s-]?off$/i, () => "Qualification Play-off"],
  [/^eliminator$/i, () => "Eliminator"],
  [/^elimination final$/i, () => "Elimination Final"],
  [/^preliminary final$/i, () => "Preliminary Final"],
  [/^challenger$/i, () => "Challenger"],
  [/^knockout$/i, () => "Knockout"],
  [/^super league final$/i, () => "Super League Final"],
  // A bare "2nd Super" is a truncated group-stage tag, not a stage anyone recognises.
  [new RegExp(`^${ORD}\\s+super$`, "i"), () => null],
];

export function normalizeStage(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  for (const [re, out] of RULES) {
    const m = s.match(re);
    if (m) return out(m);
  }
  return s;
}

/** What a finished game's pill says when it has no stage: "FT" in football, "Result" in cricket, "Final" in US sports. */
export function finishedLabel(league: League): string {
  if (isCricketLeague(league)) return "Result";
  if (isSoccerLeague(league)) return "FT";
  return "Final";
}

const OVERTIME_FINAL = /^Final\/(\d*OT)$/;

/**
 * "Final/OT" or "Final/2OT" when the stored status says the game went to overtime (ESPN's own detail, which
 * NBA.com and NFL.com print the same way); null for any other status text.
 */
export function overtimeFinal(statusDetail: string | null | undefined): string | null {
  const m = OVERTIME_FINAL.exec((statusDetail ?? "").trim());
  return m ? `Final/${m[1]}` : null;
}

/** What a finished game with no stage says: "Final/OT" or "Final/2OT" after overtime, else the league's usual word (see finishedLabel). */
export function finalLabel(league: League, statusDetail: string | null | undefined): string {
  return overtimeFinal(statusDetail) ?? finishedLabel(league);
}

/**
 * The stage of a game that has no `round`, from the columns the NBA feed fills: a play-in game and the NBA Cup
 * final. `round` itself is left alone (it marks playoff rounds, and a query for those must not pick these up).
 */
export function specialStageLabel(g: { stage?: string | null; competition_type?: string | null }): string | null {
  if (g.stage === "playin") return "Play-In";
  if (g.competition_type === "CC") return "NBA Cup final";
  return null;
}

/** The stage label a card shows: the game's round, else its play-in / Cup-final label, else its NBA Cup note label (see gameNote.ts), else null. */
export function gameRoundLabel(g: { round: string | null; stage?: string | null; competition_type?: string | null; note?: string | null }): string | null {
  return normalizeStage(g.round) ?? specialStageLabel(g) ?? cupNoteLabel(g);
}

/**
 * The word on a finished game's pill or caption: its stage, and "Final/OT" after overtime ("Second Round ·
 * Final/OT"); with no stage the league's finished word or, after overtime, "Final/OT". `fallback` replaces that
 * word for a caller that wants something else when there is nothing to say (the accessible name uses "final").
 */
export function finishedPillLabel(
  league: League,
  g: { round: string | null; stage?: string | null; competition_type?: string | null; note?: string | null; status_detail: string | null | undefined },
  fallback: string = finishedLabel(league),
): string {
  const stage = gameRoundLabel(g);
  const ot = overtimeFinal(g.status_detail);
  if (stage && ot) return `${stage} · ${ot}`;
  return stage ?? ot ?? fallback;
}
