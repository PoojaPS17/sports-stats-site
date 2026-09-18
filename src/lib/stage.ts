import { isCricketLeague, isSoccerLeague, type League } from "./leagues";

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
