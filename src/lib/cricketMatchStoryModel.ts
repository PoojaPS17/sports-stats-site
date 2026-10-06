// Geometry for the match story chart: pure numbers, so the client component only maps them to SVG.
import type { StoryInnings } from "./cricketBalls";

export interface StoryModel {
  width: number;
  height: number;
  plot: { x0: number; x1: number; y0: number; y1: number };
  overLimit: number;
  worm: { teamId: string; points: string; end: { x: number; y: number; label: string } }[];
  wormWickets: { x: number; y: number; teamId: string }[];
  wormGrid: { y: number; label: string }[];
  bars: { teamId: string; over: number; x: number; y: number; w: number; h: number; wickets: number }[];
  barGrid: { y: number; label: string }[];
  axis: { x: number; label: string }[];
  hitZones: { over: number; x: number; w: number }[];
  /** The highest-scoring over of the match (the later one on a tie): what the inspector opens on. */
  defaultOver: number;
}

const WIDTH = 1000;
const HEIGHT = 340;
const PLOT = { x0: 40, x1: 980, y0: 20, y1: 300 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 4.3 (third ball of the fifth over) as a position along the overs axis: 4.5. */
const ballPosition = (over: number) => Math.floor(over) + Math.round((over % 1) * 10) / 6;

export function matchStoryModel(innings: StoryInnings[]): StoryModel {
  const oversPlayed = Math.max(0, ...innings.map((i) => i.overs.length));
  // A T20 is 20 overs, an ODI 50; anything longer rounds up to a ten.
  const overLimit = oversPlayed <= 20 ? 20 : oversPlayed <= 50 ? 50 : Math.ceil(oversPlayed / 10) * 10;
  const topRuns = Math.max(0, ...innings.map((i) => i.total.runs));
  const runMax = Math.max(50, Math.ceil(topRuns / 50) * 50);
  const topOver = Math.max(0, ...innings.flatMap((i) => i.overs.map((o) => o.runs)));
  const barMax = Math.max(12, Math.ceil(topOver / 6) * 6);
  const xOf = (over: number) => PLOT.x0 + (over / overLimit) * (PLOT.x1 - PLOT.x0);
  const yRuns = (runs: number) => PLOT.y1 - (runs / runMax) * (PLOT.y1 - PLOT.y0);
  const yBar = (runs: number) => PLOT.y1 - (runs / barMax) * (PLOT.y1 - PLOT.y0);

  const worm = innings.map((inn) => {
    const pts = [`${PLOT.x0},${PLOT.y1}`, ...inn.worm.map((p) => `${r1(xOf(p.over))},${r1(yRuns(p.runs))}`)];
    const last = inn.worm.at(-1);
    const label = inn.total.wickets >= 10 ? String(inn.total.runs) : `${inn.total.runs}/${inn.total.wickets}`;
    return { teamId: inn.teamId, points: pts.join(" "), end: { x: r1(last ? xOf(last.over) : PLOT.x0), y: r1(last ? yRuns(last.runs) : PLOT.y1), label } };
  });
  const wormWickets = innings.flatMap((inn) => inn.wickets.map((w) => ({ x: r1(xOf(ballPosition(w.over))), y: r1(yRuns(w.runs)), teamId: inn.teamId })));
  const wormStep = runMax <= 100 ? 25 : 50;
  const wormGrid = Array.from({ length: Math.floor(runMax / wormStep) }, (_, i) => ({ y: r1(yRuns(i * wormStep)), label: String(i * wormStep) }));

  const cell = (PLOT.x1 - PLOT.x0) / overLimit;
  const sides = Math.max(1, innings.length);
  const barW = Math.max(2, (cell - 3) / sides - 2);
  const bars = innings.flatMap((inn, side) =>
    inn.overs.map((o) => {
      const x = PLOT.x0 + (o.number - 1) * cell + 1.5 + side * (barW + 2);
      const h = o.runs === 0 ? 2 : PLOT.y1 - yBar(o.runs);
      return { teamId: inn.teamId, over: o.number, x: r1(x), y: r1(PLOT.y1 - h), w: r1(barW), h: r1(h), wickets: o.wickets };
    })
  );
  const barGrid = Array.from({ length: barMax / 6 + 1 }, (_, i) => ({ y: r1(yBar(i * 6)), label: String(i * 6) }));
  const axisStep = overLimit <= 20 ? 5 : 10;
  const axis = Array.from({ length: overLimit / axisStep + 1 }, (_, i) => ({ x: r1(xOf(i * axisStep)), label: i === 0 ? "Overs" : String(i * axisStep) }));
  const hitZones = Array.from({ length: overLimit }, (_, i) => ({ over: i + 1, x: r1(PLOT.x0 + i * cell), w: r1(cell) }));

  let defaultOver = 1;
  let best = -1;
  for (const inn of innings) for (const o of inn.overs) if (o.runs >= best) [best, defaultOver] = [o.runs, o.number];

  return { width: WIDTH, height: HEIGHT, plot: PLOT, overLimit, worm, wormWickets, wormGrid, bars, barGrid, axis, hitZones, defaultOver };
}
