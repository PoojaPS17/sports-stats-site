import type { WinProbPoint } from "@/lib/matchDetail";
import { teamDisplayName } from "@/lib/teamName";
import type { GameRow } from "@/lib/queries";

const W = 640;
const H = 200;
const PAD = { top: 14, right: 12, bottom: 22, left: 34 };

// ESPN's play-by-play win probability, drawn as one line for the home side (above
// the midline the home team is favoured). Period boundaries are marked so a swing
// can be placed in the game.
export function WinProbabilityChart({ game, points }: { game: GameRow; points: WinProbPoint[] }) {
  if (points.length < 2) return null;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (pct: number) => PAD.top + (1 - pct / 100) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.home).toFixed(1)}`).join(" ");
  const periodStarts: { i: number; period: number }[] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.period !== points[i - 1].period) periodStarts.push({ i, period: p.period });
  });
  const last = points[points.length - 1];
  const homeAbbr = game.home_abbr ?? teamDisplayName(game.home_name);
  const awayAbbr = game.away_abbr ?? teamDisplayName(game.away_name);

  return (
    <div className="card px-3 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Win probability through the game: ${homeAbbr} ended at ${last.home}%`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(50)} y2={y(50)} stroke="var(--border)" strokeDasharray="4 4" />
        {periodStarts.map((s) => (
          <g key={s.i}>
            <line x1={x(s.i)} x2={x(s.i)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border)" />
            <text x={x(s.i) + 3} y={H - 8} fontSize="10" fill="var(--text-faint)">
              {s.period <= 4 ? `Q${s.period}` : "OT"}
            </text>
          </g>
        ))}
        <text x={PAD.left - 4} y={y(100) + 4} fontSize="10" textAnchor="end" fill="var(--text-faint)">
          100%
        </text>
        <text x={PAD.left - 4} y={y(50) + 4} fontSize="10" textAnchor="end" fill="var(--text-faint)">
          50%
        </text>
        <text x={PAD.left - 4} y={y(0) + 4} fontSize="10" textAnchor="end" fill="var(--text-faint)">
          0%
        </text>
        <text x={PAD.left + 4} y={PAD.top + 10} fontSize="11" fontWeight="700" fill="var(--text-muted)">
          {homeAbbr}
        </text>
        <text x={PAD.left + 4} y={H - PAD.bottom - 4} fontSize="11" fontWeight="700" fill="var(--text-muted)">
          {awayAbbr}
        </text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(last.home)} r="3.5" fill="var(--accent)" />
      </svg>
      <p className="mt-1 text-[11px] text-[var(--text-faint)]">
        Home win probability play by play, from ESPN&apos;s model. Final: {homeAbbr} {last.home}%, {awayAbbr} {(100 - last.home).toFixed(1)}%.
      </p>
    </div>
  );
}
