// The SportsDB mark: four blocks on a 2×2 grid with the top-right one lit in the live
// colour. It is the picture of the homepage (your blocks, one of them live) and the same
// geometry serves the header, the favicon and app icon, the 512px logo and the share
// images, so the brand is one shape everywhere.

const GRID = 40;
// Block positions as [x, y] in the 40-unit box. Index 1 (top right) is the lit one.
const CELLS: [number, number][] = [
  [7, 7],
  [21, 7],
  [7, 21],
  [21, 21],
];
const LIT = 1;
const SIDE = 12;
const RADIUS = 3;

export interface PixelBallProps {
  size: number;
  /** Colour of the three unlit blocks; the lit block takes `live`. Plain colours, so it also renders in share images. */
  fill: string;
  live: string;
  /** Optional square tile behind the mark (app icon, share image, logo PNG). */
  background?: string;
  backgroundRadius?: number;
  /** Fraction of the box the mark occupies when a tile is drawn. */
  inset?: number;
}

/** The mark as plain SVG, colours given explicitly. Use LogoMark in the page chrome. */
export function PixelBall({ size, fill, live, background, backgroundRadius = 0.22, inset = 0.6 }: PixelBallProps) {
  const scale = background ? inset : 1;
  const offset = ((1 - scale) * GRID) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {background && <rect width={GRID} height={GRID} rx={GRID * backgroundRadius} fill={background} />}
      <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
        {CELLS.map(([x, y], i) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={SIDE} height={SIDE} rx={RADIUS} fill={i === LIT ? live : fill} />
        ))}
      </g>
    </svg>
  );
}

/** The mark in the page's own colours: blocks in the surrounding text colour, the lit one in Volt. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return <PixelBall size={size} fill="currentColor" live="var(--sig)" />;
}

/** "SPORTSDB" in the display face (the one place it stays uppercase), DB in the signature colour. Inherits the surrounding text colour for "Sports". */
export function Wordmark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`display uppercase leading-none tracking-[0.01em] ${className}`} style={{ fontSize: size }}>
      Sports<span className="text-[var(--sig)]">DB</span>
    </span>
  );
}
