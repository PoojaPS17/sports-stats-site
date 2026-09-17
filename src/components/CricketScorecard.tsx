import Link from "next/link";
import type { League } from "@/lib/queries";
import type { CricketTeamScorecard, CricketInningsRow } from "@/lib/matchDetail";

function ScorecardTable({
  league,
  title,
  labels,
  rows,
  playerSlugs,
}: {
  league: League;
  title: string;
  labels: string[];
  rows: CricketInningsRow[];
  playerSlugs: Map<string, string>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <p className="px-4 pt-3 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="table-head text-left">
            <th className="py-2 pl-4 font-medium">Player</th>
            {labels.map((label) => (
              <th key={label} className="px-2 py-2 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const slug = playerSlugs.get(row.athleteId);
            return (
              <tr key={`${row.athleteId}-${idx}`} className="border-t border-[var(--border)]">
                <td className="py-2 pl-4 font-medium">
                  {slug ? (
                    <Link href={`/${league}/players/${slug}`} className="hover:underline">
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                </td>
                {row.stats.map((value, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CricketScorecard({
  league,
  team,
  playerSlugs,
}: {
  league: League;
  team: CricketTeamScorecard;
  playerSlugs: Map<string, string>;
}) {
  if (team.battingRows.length === 0 && team.bowlingRows.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">{team.teamName}</h3>
      <ScorecardTable league={league} title="Batting" labels={team.battingLabels} rows={team.battingRows} playerSlugs={playerSlugs} />
      <ScorecardTable league={league} title="Bowling" labels={team.bowlingLabels} rows={team.bowlingRows} playerSlugs={playerSlugs} />
    </div>
  );
}
