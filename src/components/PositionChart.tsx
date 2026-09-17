import type { TeamSeasonRow } from "@/lib/analytics";
import type { League } from "@/lib/queries";
import { formatSeasonLabel } from "@/lib/leagues";

// League finish per season as an inline SVG line chart (position 1 at the top).
// Seasons the team wasn't in the league show as a gap in the line.
export function PositionChart({ league, rows, color }: { league: League; rows: TeamSeasonRow[]; color: string | null }) {
  const played = rows.filter((r) => r.played);
  if (played.length < 2) return null;

  const seasons = played.map((r) => r.season);
  const minSeason = Math.min(...seasons);
  const maxSeason = Math.max(...seasons);
  const maxPos = Math.max(...played.map((r) => r.teamsInSeason));
  const w = 720;
  const h = 220;
  const padL = 34;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const x = (season: number) => padL + ((season - minSeason) / Math.max(1, maxSeason - minSeason)) * (w - padL - padR);
  const y = (pos: number) => padT + ((pos - 1) / Math.max(1, maxPos - 1)) * (h - padT - padB);
  const stroke = color ?? "var(--accent)";

  // Build path segments, breaking the line where a season is missing.
  const segments: string[] = [];
  let current: string[] = [];
  for (let s = minSeason; s <= maxSeason; s++) {
    const r = played.find((p) => p.season === s);
    if (!r) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${current.length ? "L" : "M"}${x(s).toFixed(1)},${y(r.position).toFixed(1)}`);
  }
  if (current.length) segments.push(current.join(" "));

  const gridPositions = [1, Math.round(maxPos / 2), maxPos].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <figure className="card overflow-x-auto px-3 py-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[480px]" role="img" aria-label="League finish by season">
        {gridPositions.map((p) => (
          <g key={p}>
            <line x1={padL} x2={w - padR} y1={y(p)} y2={y(p)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={padL - 8} y={y(p) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">
              {p === 1 ? "1st" : `${p}th`}
            </text>
          </g>
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {played.map((r) => (
          <g key={r.season}>
            <circle cx={x(r.season)} cy={y(r.position)} r="4.5" fill="var(--surface)" stroke={stroke} strokeWidth="2.5" />
            <text x={x(r.season)} y={y(r.position) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">
              {r.position}
            </text>
            <text x={x(r.season)} y={h - 12} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {formatSeasonLabel(league, r.season)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
