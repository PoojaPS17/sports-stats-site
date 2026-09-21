import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import type { League } from "@/lib/queries";
import type { PlayerProfile } from "@/lib/playerProfile";
import { fmtDate } from "./PlayerStatsShared";

const RESULT_FILL: Record<string, string> = { W: "#10b981", D: "#9ca3af", L: "#f43f5e" };

// Last ten games, oldest to newest: one bar per game for the sport's form figure,
// coloured by the team's result that day.
export function PlayerFormChart({ league, profile }: { league: League; profile: PlayerProfile }) {
  const points = profile.form;
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const w = 640;
  const h = 150;
  const pad = { l: 28, r: 8, t: 18, b: 26 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const slot = innerW / Math.max(points.length, 1);
  const barW = Math.min(40, slot * 0.6);
  return (
    <div className="card px-4 py-3">
      <p className="mb-1 text-xs text-[var(--text-muted)]">
        {profile.profile.form.label}, last {points.length} game{points.length === 1 ? "" : "s"} on record. Bars are coloured by the team&apos;s result.
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={`${profile.profile.form.label} over the last ${points.length} games`}>
        <line x1={pad.l} y1={pad.t + innerH} x2={w - pad.r} y2={pad.t + innerH} stroke="var(--border)" />
        <text x={pad.l - 6} y={pad.t + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
          {max}
        </text>
        <text x={pad.l - 6} y={pad.t + innerH} textAnchor="end" fontSize="10" fill="var(--text-muted)">
          0
        </text>
        {points.map((p, i) => {
          const v = p.value ?? 0;
          const bh = (v / max) * innerH;
          const x = pad.l + slot * i + (slot - barW) / 2;
          const y = pad.t + innerH - bh;
          return (
            <Link key={p.row.game_espn_id} href={`/${league}/games/${p.row.game_espn_id}`}>
              <title>{`${p.row.is_home ? "vs" : "at"} ${teamDisplayName(p.row.opponent_name)}, ${fmtDate(p.row.date, league)}: ${p.value ?? "–"}`}</title>
              <rect x={x} y={y} width={barW} height={Math.max(bh, 1)} rx="3" fill={RESULT_FILL[p.row.result ?? "D"]} opacity={v === 0 ? 0.35 : 0.9} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text)">
                {p.value ?? ""}
              </text>
              <text x={x + barW / 2} y={pad.t + innerH + 14} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
                {p.row.opponent_abbr ?? teamDisplayName(p.row.opponent_name).slice(0, 3).toUpperCase()}
              </text>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}
