// Top performers from the parsed scorecard: the Player of the Match's best line (or the match's top
// scorer) for the large card, the leading batter and bowler of each innings for the small ones.
import type { CricketInningsRow, CricketTeamScorecard } from "./matchDetail";

export interface Performer {
  athleteId: string;
  name: string;
  teamId: string;
  innings: number;
  kind: "bat" | "bowl";
  /** "34*" or "3/24". */
  figure: string;
  /** "25 balls · 1 four · 2 sixes · SR 136.00" or "4 overs · 1 maiden · econ 6.00". */
  detail: string;
}

const num = (s: string | undefined) => (s != null && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Bat extends Performer {
  kind: "bat";
  runs: number;
  balls: number;
}
interface Bowl extends Performer {
  kind: "bowl";
  wickets: number;
  conceded: number;
}

function batLine(team: CricketTeamScorecard, r: CricketInningsRow, innings: number): Bat | null {
  const runs = num(r.stats[0]);
  if (runs == null) return null;
  const balls = num(r.stats[1]);
  const fours = num(r.stats[2]) ?? 0;
  const sixes = num(r.stats[3]) ?? 0;
  const sr = num(r.stats[4]);
  const notOut = /not out|retired/i.test(r.dismissal ?? "");
  const detail = [balls != null ? plural(balls, "ball", "balls") : null, fours > 0 ? plural(fours, "four", "fours") : null, sixes > 0 ? plural(sixes, "six", "sixes") : null, sr != null ? `SR ${sr.toFixed(2)}` : null].filter(Boolean).join(" · ");
  return { athleteId: r.athleteId, name: r.name, teamId: team.teamId, innings, kind: "bat", figure: `${runs}${notOut ? "*" : ""}`, detail, runs, balls: balls ?? Number.POSITIVE_INFINITY };
}

function bowlLine(team: CricketTeamScorecard, r: CricketInningsRow, innings: number): Bowl | null {
  const wickets = num(r.stats[3]);
  const conceded = num(r.stats[2]);
  if (wickets == null || conceded == null) return null;
  const overs = r.stats[0];
  const maidens = num(r.stats[1]) ?? 0;
  const econ = num(r.stats[4]);
  const detail = [overs && overs !== "-" ? `${overs} overs` : null, maidens > 0 ? plural(maidens, "maiden", "maidens") : null, econ != null ? `econ ${econ.toFixed(2)}` : null].filter(Boolean).join(" · ");
  return { athleteId: r.athleteId, name: r.name, teamId: team.teamId, innings, kind: "bowl", figure: `${wickets}/${conceded}`, detail, wickets, conceded };
}

const betterBat = (a: Bat, b: Bat) => b.runs - a.runs || a.balls - b.balls;
const betterBowl = (a: Bowl, b: Bowl) => b.wickets - a.wickets || a.conceded - b.conceded;
const strip = (p: Bat | Bowl): Performer => ({ athleteId: p.athleteId, name: p.name, teamId: p.teamId, innings: p.innings, kind: p.kind, figure: p.figure, detail: p.detail });

/**
 * The cards: `large` is the Player of the Match's best line (batting when it is 40 or more or there is no
 * two-wicket return, else bowling), or the match's top scorer when ESPN names no one (or someone the
 * scorecard does not have); `small` is each innings' leading batter then bowler, skipping the large card's
 * player, four at most.
 */
export function topPerformers(scorecard: CricketTeamScorecard[], potm: string | null): { large: Performer | null; small: Performer[] } {
  const bats: Bat[] = [];
  const bowls: Bowl[] = [];
  scorecard.forEach((team, t) => {
    for (const r of team.battingRows) {
      const line = batLine(team, r, r.innings ?? t + 1);
      if (line) bats.push(line);
    }
    for (const r of team.bowlingRows) {
      const line = bowlLine(team, r, r.innings ?? (1 - t) + 1);
      if (line && line.wickets >= 1) bowls.push(line);
    }
  });
  if (bats.length === 0 && bowls.length === 0) return { large: null, small: [] };

  let large: Bat | Bowl | null = null;
  if (potm) {
    const bat = bats.filter((b) => b.name === potm).sort(betterBat)[0];
    const bowl = bowls.filter((b) => b.name === potm).sort(betterBowl)[0];
    if (bat && (bat.runs >= 40 || !bowl || bowl.wickets < 2)) large = bat;
    else if (bowl) large = bowl;
  }
  if (!large) large = [...bats].sort(betterBat)[0] ?? [...bowls].sort(betterBowl)[0] ?? null;

  const periods = Array.from(new Set([...bats, ...bowls].map((p) => p.innings))).sort((a, b) => a - b);
  const small: Performer[] = [];
  for (const period of periods) {
    const bat = bats.filter((b) => b.innings === period).sort(betterBat)[0];
    const bowl = bowls.filter((b) => b.innings === period).sort(betterBowl)[0];
    for (const p of [bat, bowl]) if (p && p.athleteId !== large?.athleteId && small.length < 4) small.push(strip(p));
  }
  return { large: large ? strip(large) : null, small };
}
