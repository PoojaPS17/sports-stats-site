// The SportsDB mark: a ball drawn as a 5×5 grid of data cells, with one cell lit
// in the live colour. The same geometry serves the header, the favicon and app
// icon, and the share images, so the brand is one shape everywhere.

// Grid cells that make up the ball, as [column, row] on a 5×5 grid (the corners
// are empty, which is what makes it read as a ball rather than a square).
const CELLS: [number, number][] = [
  [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3],
  [1, 4], [2, 4], [3, 4],
];
const LIVE_CELL: [number, number] = [3, 0];
const UNIT = 8;
const GAP = 1.4;
const RADIUS = 1.6;

export interface PixelBallProps {
  size: number;
  /** Cell colour; the live cell takes `live`. Plain colours, so it also renders in share images. */
  fill: string;
  live: string;
  /** Optional square backdrop behind the ball (app icon, share image). */
  background?: string;
  backgroundRadius?: number;
  /** Fraction of the box the ball occupies when a background is drawn. */
  inset?: number;
}

/** The mark as plain SVG, colours given explicitly. Use LogoMark in the page chrome. */
export function PixelBall({ size, fill, live, background, backgroundRadius = 0.22, inset = 0.6 }: PixelBallProps) {
  const grid = UNIT * 5;
  const scale = background ? inset : 1;
  const offset = ((1 - scale) * grid) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${grid} ${grid}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {background && <rect width={grid} height={grid} rx={grid * backgroundRadius} fill={background} />}
      <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
        {CELLS.map(([c, r]) => (
          <rect
            key={`${c}-${r}`}
            x={c * UNIT + GAP / 2}
            y={r * UNIT + GAP / 2}
            width={UNIT - GAP}
            height={UNIT - GAP}
            rx={RADIUS}
            fill={c === LIVE_CELL[0] && r === LIVE_CELL[1] ? live : fill}
          />
        ))}
      </g>
    </svg>
  );
}

/** The mark in the page's own colours: accent cells, live-red cell, no backdrop. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return <PixelBall size={size} fill="var(--accent)" live="var(--live)" />;
}
